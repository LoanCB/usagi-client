use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager, Runtime, State};
use zeroize::Zeroizing;

use super::keys::{open_backup, open_local_dek, seal_backup, Key};
use super::keystore::OsKeyStore;
use super::service::{Vault, VaultStatusReport};
use super::VaultError;
use crate::crypto::state::CryptoState;

pub struct VaultRuntime {
    vault: Arc<Vault<OsKeyStore>>,
    /// The open database's key, held for the process lifetime: the Security
    /// tab and the backup commands need it after unlock.
    ldk: Mutex<Option<Key>>,
    /// Held for the whole of every command that touches vault.json: two
    /// concurrent load/modify/save cycles would silently lose one update.
    gate: tokio::sync::Mutex<()>,
}

impl VaultRuntime {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            vault: Arc::new(Vault::new(dir, OsKeyStore)),
            ldk: Mutex::new(None),
            gate: tokio::sync::Mutex::new(()),
        }
    }

    fn ldk(&self) -> Result<Key, VaultError> {
        self.ldk
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
            .ok_or_else(|| VaultError::InvalidState("database is locked".into()))
    }

    fn ensure_closed(&self) -> Result<(), VaultError> {
        if self.is_open() {
            return Err(VaultError::InvalidState("database already open".into()));
        }
        Ok(())
    }

    fn is_open(&self) -> bool {
        self.ldk.lock().unwrap_or_else(|e| e.into_inner()).is_some()
    }
}

type Rt<'a> = State<'a, VaultRuntime>;
type Crypto<'a> = State<'a, Mutex<CryptoState>>;

/// Runs a synchronous vault method (Argon2id, fsync) off the async workers.
async fn blocking<T: Send + 'static>(
    rt: &VaultRuntime,
    f: impl FnOnce(&Vault<OsKeyStore>) -> Result<T, VaultError> + Send + 'static,
) -> Result<T, VaultError> {
    let vault = rt.vault.clone();
    tauri::async_runtime::spawn_blocking(move || f(&vault))
        .await
        .map_err(|e| VaultError::Io(e.to_string()))?
}

/// Same, for the async Vault methods (they run Argon2id, keychain calls and the
/// migration inline).
async fn blocking_async<T: Send + 'static, Fut>(
    rt: &VaultRuntime,
    f: impl FnOnce(Arc<Vault<OsKeyStore>>) -> Fut + Send + 'static,
) -> Result<T, VaultError>
where
    Fut: std::future::Future<Output = Result<T, VaultError>>,
{
    let vault = rt.vault.clone();
    tauri::async_runtime::spawn_blocking(move || tauri::async_runtime::block_on(f(vault)))
        .await
        .map_err(|e| VaultError::Io(e.to_string()))?
}

/// Must only run after the Vault method that unlocked (and, on first launch,
/// migrated) the database returned: nothing may open usagi.db before that.
async fn open(app: &AppHandle, rt: &VaultRuntime, ldk: Key) -> Result<(), VaultError> {
    // Backstop: a second pool would replace the live one under DB_URL.
    rt.ensure_closed()?;
    let (app2, dir, key) = (app.clone(), rt.vault.dir().to_path_buf(), ldk.clone());
    tauri::async_runtime::spawn_blocking(move || crate::db::open_and_register(&app2, &dir, &key))
        .await
        .map_err(|e| VaultError::Io(e.to_string()))??;
    *rt.ldk.lock().unwrap_or_else(|e| e.into_inner()) = Some(ldk);
    Ok(())
}

#[derive(Debug, PartialEq, Eq)]
enum Reopen {
    Open,
    AlreadyOpen,
}

/// A webview reload restarts the frontend on its lock screen while this process
/// keeps the pool open. The unlock that follows must then only prove the secret
/// (the caller already did, by deriving `ldk`), never register a second pool.
fn reopen_decision(held: Option<&[u8; 32]>, ldk: &[u8; 32]) -> Result<Reopen, VaultError> {
    match held {
        None => Ok(Reopen::Open),
        Some(held) if held == ldk => Ok(Reopen::AlreadyOpen),
        Some(_) => Err(VaultError::InvalidState(
            "a different database is already open".into(),
        )),
    }
}

async fn open_or_confirm(app: &AppHandle, rt: &VaultRuntime, ldk: Key) -> Result<(), VaultError> {
    let held = rt.ldk.lock().unwrap_or_else(|e| e.into_inner()).clone();
    match reopen_decision(held.as_deref(), &ldk)? {
        Reopen::Open => open(app, rt, ldk).await,
        Reopen::AlreadyOpen => Ok(()),
    }
}

#[tauri::command]
pub fn vault_status(rt: Rt<'_>) -> VaultStatusReport {
    rt.vault.status()
}

#[tauri::command]
pub async fn vault_setup_keychain(app: AppHandle, rt: Rt<'_>) -> Result<(), VaultError> {
    let _gate = rt.gate.lock().await;
    if rt.is_open() {
        return Ok(());
    }
    let ldk = blocking_async(&rt, |v| async move { v.setup_keychain().await }).await?;
    open(&app, &rt, ldk).await
}

#[tauri::command]
pub async fn vault_setup_password(
    app: AppHandle,
    rt: Rt<'_>,
    password: String,
) -> Result<String, VaultError> {
    let password = Zeroizing::new(password);
    let _gate = rt.gate.lock().await;
    rt.ensure_closed()?;
    let (ldk, phrase) = blocking_async(
        &rt,
        move |v| async move { v.setup_password(&password).await },
    )
    .await?;
    open(&app, &rt, ldk).await?;
    Ok(phrase)
}

#[tauri::command]
pub async fn vault_unlock_keychain(app: AppHandle, rt: Rt<'_>) -> Result<(), VaultError> {
    let _gate = rt.gate.lock().await;
    // StrictMode runs the gate's auto-unlock effect twice in dev.
    if rt.is_open() {
        return Ok(());
    }
    let ldk = blocking_async(&rt, |v| async move { v.unlock_keychain().await }).await?;
    open(&app, &rt, ldk).await
}

#[tauri::command]
pub async fn vault_unlock_password(
    app: AppHandle,
    rt: Rt<'_>,
    password: String,
) -> Result<(), VaultError> {
    let password = Zeroizing::new(password);
    let _gate = rt.gate.lock().await;
    let ldk = blocking_async(
        &rt,
        move |v| async move { v.unlock_password(&password).await },
    )
    .await?;
    open_or_confirm(&app, &rt, ldk).await
}

#[tauri::command]
pub async fn vault_unlock_recovery(
    app: AppHandle,
    rt: Rt<'_>,
    phrase: String,
    new_password: String,
) -> Result<(), VaultError> {
    let (phrase, new_password) = (Zeroizing::new(phrase), Zeroizing::new(new_password));
    let _gate = rt.gate.lock().await;
    let ldk = blocking_async(&rt, move |v| async move {
        v.unlock_recovery(&phrase, &new_password).await
    })
    .await?;
    open_or_confirm(&app, &rt, ldk).await
}

#[tauri::command]
pub async fn vault_set_password(rt: Rt<'_>, password: String) -> Result<String, VaultError> {
    let password = Zeroizing::new(password);
    let _gate = rt.gate.lock().await;
    let ldk = rt.ldk()?;
    blocking(&rt, move |v| v.set_password(&ldk, &password)).await
}

#[tauri::command]
pub async fn vault_change_password(
    rt: Rt<'_>,
    current: String,
    new_password: String,
) -> Result<(), VaultError> {
    let (current, new_password) = (Zeroizing::new(current), Zeroizing::new(new_password));
    let _gate = rt.gate.lock().await;
    blocking(&rt, move |v| v.change_password(&current, &new_password)).await
}

#[tauri::command]
pub async fn vault_remove_password(rt: Rt<'_>, current: String) -> Result<(), VaultError> {
    let current = Zeroizing::new(current);
    let _gate = rt.gate.lock().await;
    blocking(&rt, move |v| v.remove_password(&current)).await
}

#[tauri::command]
pub async fn vault_bind_account(
    rt: Rt<'_>,
    crypto: Crypto<'_>,
    wrapped_dek_recovery: String,
) -> Result<String, VaultError> {
    let _gate = rt.gate.lock().await;
    let ldk = rt.ldk()?;
    let (local_kek, salt, dek) = crypto
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take_bind_material()
        .map_err(|_| VaultError::InvalidState("no completed account unlock to bind".into()))?;
    let dek = Zeroizing::new(dek);
    let (kek_back, salt_back) = (local_kek.clone(), salt.clone());
    let result = blocking(&rt, move |v| {
        v.bind_account(&ldk, &local_kek, &salt, &dek, &wrapped_dek_recovery)
    })
    .await;
    if result.is_err() {
        // Let a transient failure be retried without signing in again.
        crypto
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .restore_bind(kek_back, salt_back);
    }
    result
}

#[tauri::command]
pub async fn vault_unbind_account(rt: Rt<'_>) -> Result<(), VaultError> {
    let _gate = rt.gate.lock().await;
    let ldk = rt.ldk()?;
    blocking(&rt, move |v| v.unbind_account(&ldk)).await
}

#[tauri::command]
pub fn vault_unlock_sync(
    rt: Rt<'_>,
    crypto: Crypto<'_>,
    local_dek: String,
    user_id: String,
) -> Result<(), VaultError> {
    let dek = open_local_dek(&*rt.ldk()?, &local_dek)?;
    crypto
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .unlock_with_dek(*dek, &user_id);
    Ok(())
}

#[tauri::command]
pub fn vault_seal_backup(rt: Rt<'_>, plaintext: String) -> Result<String, VaultError> {
    Ok(seal_backup(&*rt.ldk()?, plaintext.as_bytes()))
}

#[tauri::command]
pub fn vault_open_backup(rt: Rt<'_>, blob: String) -> Result<String, VaultError> {
    let bytes = open_backup(&*rt.ldk()?, &blob)?;
    String::from_utf8(bytes).map_err(|_| VaultError::WrongSecret)
}

pub fn manage<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let dir = app.path().app_config_dir()?;
    std::fs::create_dir_all(&dir)?;
    app.manage(VaultRuntime::new(dir));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_closed_database_must_be_opened() {
        assert_eq!(reopen_decision(None, &[1u8; 32]), Ok(Reopen::Open));
    }

    #[test]
    fn the_same_key_after_a_webview_reload_only_confirms() {
        assert_eq!(
            reopen_decision(Some(&[1u8; 32]), &[1u8; 32]),
            Ok(Reopen::AlreadyOpen)
        );
    }

    #[test]
    fn a_different_key_while_open_is_refused() {
        assert!(matches!(
            reopen_decision(Some(&[1u8; 32]), &[2u8; 32]),
            Err(VaultError::InvalidState(_))
        ));
    }
}
