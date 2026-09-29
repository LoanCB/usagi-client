use std::path::{Path, PathBuf};

use serde::Serialize;

use super::file::{
    load, new_vault_id, save, MigrationMarker, VaultFile, VaultMode, FILE_VERSION, VAULT_FILE,
};
use super::keys::{
    generate_ldk, local_kek_from_password, recovery_kek, seal_local_dek, unwrap_key, wrap_key, Key,
    AAD_LDK, AAD_LDK_DEK, AAD_LDK_RECOVERY,
};
use super::keystore::KeyStore;
use super::migrate::{encrypt_legacy_backups, is_plaintext_sqlite, migrate, PLAIN_FILE};
use super::VaultError;
use crate::crypto::account::KdfParams;
use crate::crypto::derive::generate_auth_salt;
use crate::crypto::recovery::generate_recovery_phrase;
use crate::crypto::wrap::AAD_DEK_RECOVERY;
use crate::db::DB_FILE;

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatusReport {
    pub state: &'static str,
    pub migrating: bool,
    pub sync_bound: bool,
    pub broken_reason: Option<&'static str>,
}

impl VaultStatusReport {
    fn plain(state: &'static str) -> Self {
        Self {
            state,
            migrating: false,
            sync_bound: false,
            broken_reason: None,
        }
    }
    fn broken(reason: &'static str) -> Self {
        Self {
            broken_reason: Some(reason),
            ..Self::plain("broken")
        }
    }
}

pub struct Vault<K: KeyStore> {
    dir: PathBuf,
    keys: K,
}

fn invalid(what: &str) -> VaultError {
    VaultError::InvalidState(what.into())
}

impl<K: KeyStore> Vault<K> {
    pub fn new(dir: PathBuf, keys: K) -> Self {
        Self { dir, keys }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    fn file(&self) -> Result<VaultFile, VaultError> {
        load(&self.dir)?.ok_or_else(|| invalid("no vault"))
    }

    pub fn status(&self) -> VaultStatusReport {
        let db = self.dir.join(DB_FILE);
        match load(&self.dir) {
            Err(_) => VaultStatusReport::broken("corrupt"),
            // An empty file is what a crashed first launch leaves behind.
            Ok(None) if std::fs::metadata(&db).map_or(true, |m| m.len() == 0) => {
                VaultStatusReport::plain("fresh")
            }
            Ok(None) => match is_plaintext_sqlite(&db) {
                Ok(true) => VaultStatusReport::plain("legacy-plaintext"),
                // Encrypted (or unreadable) bytes with no wrappings to open them.
                _ => VaultStatusReport::broken("vault-missing"),
            },
            Ok(Some(f)) => VaultStatusReport {
                state: match f.mode {
                    VaultMode::Keychain => "keychain",
                    VaultMode::Password => "password",
                },
                migrating: f.migration.is_some(),
                sync_bound: f.wrapped_ldk_by_dek.is_some(),
                broken_reason: None,
            },
        }
    }

    fn assert_setup_allowed(&self) -> Result<bool, VaultError> {
        match self.status().state {
            "fresh" => Ok(false),
            "legacy-plaintext" => Ok(true),
            _ => Err(invalid("a vault already exists")),
        }
    }

    fn base_file(mode: VaultMode, legacy: bool) -> VaultFile {
        VaultFile {
            version: FILE_VERSION,
            vault_id: new_vault_id(),
            mode,
            salt: None,
            kdf: None,
            wrapped_ldk: None,
            wrapped_ldk_recovery: None,
            wrapped_ldk_by_dek: None,
            wrapped_dek_recovery: None,
            migration: legacy.then_some(MigrationMarker::Pending),
        }
    }

    /// Writes the password wrapping into `file` under a fresh salt.
    fn wrap_under_password(
        file: &mut VaultFile,
        ldk: &[u8; 32],
        password: &str,
    ) -> Result<(), VaultError> {
        let salt = generate_auth_salt();
        let kek = local_kek_from_password(password, &salt)?;
        file.mode = VaultMode::Password;
        file.wrapped_ldk = Some(wrap_key(&kek, AAD_LDK, ldk));
        file.salt = Some(salt);
        file.kdf = Some(KdfParams::current());
        Ok(())
    }

    fn new_recovery(file: &mut VaultFile, ldk: &[u8; 32]) -> Result<String, VaultError> {
        let phrase = generate_recovery_phrase();
        let rk = recovery_kek(&phrase)?;
        file.wrapped_ldk_recovery = Some(wrap_key(&rk, AAD_LDK_RECOVERY, ldk));
        Ok(phrase)
    }

    async fn finish_migration(
        &self,
        mut file: VaultFile,
        ldk: &[u8; 32],
    ) -> Result<(), VaultError> {
        if file.migration.is_none() {
            return Ok(());
        }
        migrate(&self.dir, ldk).await?;
        encrypt_legacy_backups(&self.dir, ldk)?;
        file.migration = None;
        save(&self.dir, &file)
    }

    /// Runs the migration of a freshly created vault. On failure, undoes the
    /// setup when the plaintext database is provably still the only copy and
    /// untouched, so a retry starts clean instead of reusing a recovery phrase
    /// the user already saw.
    async fn finish_setup(
        &self,
        file: VaultFile,
        ldk: &[u8; 32],
        legacy: bool,
    ) -> Result<(), VaultError> {
        let vault_id = file.vault_id.clone();
        let Err(err) = self.finish_migration(file, ldk).await else {
            return Ok(());
        };
        let db = self.dir.join(DB_FILE);
        let untouched = legacy
            && !self.dir.join(PLAIN_FILE).exists()
            && matches!(is_plaintext_sqlite(&db), Ok(true));
        if untouched && std::fs::remove_file(self.dir.join(VAULT_FILE)).is_ok() {
            let _ = self.keys.delete(&vault_id);
        }
        Err(err)
    }

    pub async fn setup_keychain(&self) -> Result<Key, VaultError> {
        let legacy = self.assert_setup_allowed()?;
        let ldk = generate_ldk();
        let file = Self::base_file(VaultMode::Keychain, legacy);
        self.keys.set(&file.vault_id, &ldk)?;
        save(&self.dir, &file)?;
        self.finish_setup(file, &ldk, legacy).await?;
        Ok(ldk)
    }

    pub async fn setup_password(&self, password: &str) -> Result<(Key, String), VaultError> {
        let legacy = self.assert_setup_allowed()?;
        let ldk = generate_ldk();
        let mut file = Self::base_file(VaultMode::Password, legacy);
        Self::wrap_under_password(&mut file, &ldk, password)?;
        let phrase = Self::new_recovery(&mut file, &ldk)?;
        save(&self.dir, &file)?;
        self.finish_setup(file, &ldk, legacy).await?;
        Ok((ldk, phrase))
    }

    pub async fn unlock_keychain(&self) -> Result<Key, VaultError> {
        let file = self.file()?;
        if file.mode != VaultMode::Keychain {
            return Err(invalid("vault is not in keychain mode"));
        }
        let ldk = self.keys.get(&file.vault_id)?;
        self.finish_migration(file, &ldk).await?;
        Ok(ldk)
    }

    /// A password-mode vault must not keep a keychain copy of its key; a failed
    /// delete right after switching modes is retried here.
    fn drop_leftover_keychain_entry(&self, file: &VaultFile) {
        if file.mode == VaultMode::Password {
            let _ = self.keys.delete(&file.vault_id);
        }
    }

    /// Refuses a caller-supplied LDK that is not the one the vault uses.
    fn assert_keychain_ldk(&self, file: &VaultFile, ldk: &[u8; 32]) -> Result<(), VaultError> {
        if file.mode == VaultMode::Keychain && *self.keys.get(&file.vault_id)? != *ldk {
            return Err(invalid("the key does not belong to this vault"));
        }
        Ok(())
    }

    fn open_with_password(file: &VaultFile, password: &str) -> Result<Key, VaultError> {
        let (Some(salt), Some(wrapped)) = (&file.salt, &file.wrapped_ldk) else {
            return Err(invalid("vault has no password wrapping"));
        };
        let kek = local_kek_from_password(password, salt)?;
        Ok(unwrap_key(&kek, AAD_LDK, wrapped)?)
    }

    pub async fn unlock_password(&self, password: &str) -> Result<Key, VaultError> {
        let file = self.file()?;
        let ldk = Self::open_with_password(&file, password)?;
        self.drop_leftover_keychain_entry(&file);
        self.finish_migration(file, &ldk).await?;
        Ok(ldk)
    }

    /// Tries the local phrase, then the account phrase (phrase → DEK → LDK).
    fn open_with_phrase(file: &VaultFile, phrase: &str) -> Result<Key, VaultError> {
        let rk = recovery_kek(phrase)?;
        if let Some(blob) = &file.wrapped_ldk_recovery {
            if let Ok(ldk) = unwrap_key(&rk, AAD_LDK_RECOVERY, blob) {
                return Ok(ldk);
            }
        }
        if let (Some(wdr), Some(by_dek)) = (&file.wrapped_dek_recovery, &file.wrapped_ldk_by_dek) {
            let dek = unwrap_key(&rk, AAD_DEK_RECOVERY, wdr)?;
            return Ok(unwrap_key(&dek, AAD_LDK_DEK, by_dek)?);
        }
        Err(VaultError::WrongSecret)
    }

    pub async fn unlock_recovery(
        &self,
        phrase: &str,
        new_password: &str,
    ) -> Result<Key, VaultError> {
        let mut file = self.file()?;
        if file.mode != VaultMode::Password {
            return Err(invalid("vault is not in password mode"));
        }
        let ldk = Self::open_with_phrase(&file, phrase)?;
        Self::wrap_under_password(&mut file, &ldk, new_password)?;
        save(&self.dir, &file)?;
        self.drop_leftover_keychain_entry(&file);
        self.finish_migration(file, &ldk).await?;
        Ok(ldk)
    }

    pub fn set_password(&self, ldk: &[u8; 32], password: &str) -> Result<String, VaultError> {
        let mut file = self.file()?;
        if file.mode != VaultMode::Keychain {
            return Err(invalid("a password is already set"));
        }
        self.assert_keychain_ldk(&file, ldk)?;
        Self::wrap_under_password(&mut file, ldk, password)?;
        let phrase = Self::new_recovery(&mut file, ldk)?;
        save(&self.dir, &file)?;
        // Only after the password wrapping is durable: dropping the keychain
        // entry first would leave a window with no way in. A failure here is
        // retried by the next password unlock.
        let _ = self.keys.delete(&file.vault_id);
        Ok(phrase)
    }

    pub fn change_password(&self, current: &str, new_password: &str) -> Result<(), VaultError> {
        let mut file = self.file()?;
        if file.wrapped_ldk_by_dek.is_some() {
            return Err(invalid("the password belongs to the sync account"));
        }
        let ldk = Self::open_with_password(&file, current)?;
        Self::wrap_under_password(&mut file, &ldk, new_password)?;
        save(&self.dir, &file)
    }

    pub fn remove_password(&self, current: &str) -> Result<(), VaultError> {
        let mut file = self.file()?;
        if file.wrapped_ldk_by_dek.is_some() {
            return Err(invalid("a synced vault always needs its password"));
        }
        let ldk = Self::open_with_password(&file, current)?;
        self.keys.set(&file.vault_id, &ldk)?;
        file.mode = VaultMode::Keychain;
        file.salt = None;
        file.kdf = None;
        file.wrapped_ldk = None;
        file.wrapped_ldk_recovery = None;
        save(&self.dir, &file)
    }

    pub fn bind_account(
        &self,
        ldk: &[u8; 32],
        local_kek: &[u8; 32],
        salt: &str,
        dek: &[u8; 32],
        wrapped_dek_recovery: &str,
    ) -> Result<String, VaultError> {
        let mut file = self.file()?;
        self.assert_keychain_ldk(&file, ldk)?;
        let was_keychain = file.mode == VaultMode::Keychain;
        file.mode = VaultMode::Password;
        file.salt = Some(salt.to_owned());
        file.kdf = Some(KdfParams::current());
        file.wrapped_ldk = Some(wrap_key(local_kek, AAD_LDK, ldk));
        file.wrapped_ldk_by_dek = Some(wrap_key(dek, AAD_LDK_DEK, ldk));
        file.wrapped_dek_recovery = Some(wrapped_dek_recovery.to_owned());
        save(&self.dir, &file)?;
        if was_keychain {
            let _ = self.keys.delete(&file.vault_id);
        }
        Ok(seal_local_dek(ldk, dek))
    }

    /// Without a local recovery wrapping, the vault started in keychain mode
    /// (binding never adds one): leaving it in password mode would strand the
    /// user with the account password and no recovery phrase behind it.
    pub fn unbind_account(&self, ldk: &[u8; 32]) -> Result<(), VaultError> {
        let mut file = self.file()?;
        file.wrapped_ldk_by_dek = None;
        file.wrapped_dek_recovery = None;
        if file.wrapped_ldk_recovery.is_none() {
            // The keychain copy must be durable before the password wrapping goes.
            self.keys.set(&file.vault_id, ldk)?;
            file.mode = VaultMode::Keychain;
            file.salt = None;
            file.kdf = None;
            file.wrapped_ldk = None;
        }
        save(&self.dir, &file)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::account::prepare_registration;
    use crate::crypto::derive::derive_master_key;
    use crate::crypto::wrap::open as open_blob;
    use crate::crypto::wrap::AAD_DEK;
    use crate::vault::keys::{local_kek_from_master, open_local_dek};
    use crate::vault::keystore::MemoryKeyStore;

    fn vault() -> (tempfile::TempDir, Vault<MemoryKeyStore>) {
        let dir = tempfile::tempdir().unwrap();
        let v = Vault::new(dir.path().to_path_buf(), MemoryKeyStore::new());
        (dir, v)
    }

    fn file(v: &Vault<MemoryKeyStore>) -> VaultFile {
        load(v.dir()).unwrap().unwrap()
    }

    /// The DEK and the bind material a real sign-in would produce.
    fn account(password: &str) -> ([u8; 32], Key, String, String, String) {
        let m = prepare_registration(password).unwrap();
        let master = derive_master_key(password, &m.auth_salt).unwrap();
        let kek = crate::crypto::derive::derive_kek(&master);
        let dek: [u8; 32] = open_blob(&kek, AAD_DEK, &m.wrapped_dek)
            .unwrap()
            .try_into()
            .unwrap();
        (
            dek,
            local_kek_from_master(&master),
            m.auth_salt,
            m.wrapped_dek_recovery,
            m.recovery_phrase,
        )
    }

    #[test]
    fn an_empty_dir_is_fresh() {
        let (_d, v) = vault();
        assert_eq!(v.status().state, "fresh");
    }

    #[tokio::test]
    async fn keychain_setup_then_unlock_returns_the_same_ldk() {
        let (_d, v) = vault();
        let ldk = v.setup_keychain().await.unwrap();
        let s = v.status();
        assert_eq!(
            (s.state, s.migrating, s.sync_bound),
            ("keychain", false, false)
        );
        assert_eq!(*v.unlock_keychain().await.unwrap(), *ldk);
    }

    #[tokio::test]
    async fn two_vaults_sharing_a_keychain_do_not_collide() {
        let store = std::sync::Arc::new(MemoryKeyStore::new());
        struct Shared(std::sync::Arc<MemoryKeyStore>);
        impl KeyStore for Shared {
            fn get(&self, id: &str) -> Result<Key, VaultError> {
                self.0.get(id)
            }
            fn set(&self, id: &str, k: &[u8; 32]) -> Result<(), VaultError> {
                self.0.set(id, k)
            }
            fn delete(&self, id: &str) -> Result<(), VaultError> {
                self.0.delete(id)
            }
        }
        let (d1, d2) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let a = Vault::new(d1.path().to_path_buf(), Shared(store.clone()));
        let b = Vault::new(d2.path().to_path_buf(), Shared(store.clone()));
        let ka = a.setup_keychain().await.unwrap();
        let kb = b.setup_keychain().await.unwrap();
        assert_eq!(*a.unlock_keychain().await.unwrap(), *ka);
        assert_eq!(*b.unlock_keychain().await.unwrap(), *kb);
    }

    #[tokio::test]
    async fn a_lost_keychain_entry_is_key_missing() {
        let (_d, v) = vault();
        v.setup_keychain().await.unwrap();
        v.keys.delete(&file(&v).vault_id).unwrap();
        assert_eq!(
            v.unlock_keychain().await.unwrap_err(),
            VaultError::KeyMissing
        );
    }

    #[tokio::test]
    async fn password_setup_then_unlock() {
        let (_d, v) = vault();
        let (ldk, phrase) = v.setup_password("pw").await.unwrap();
        assert_eq!(phrase.split_whitespace().count(), 24);
        assert_eq!(v.status().state, "password");
        assert_eq!(*v.unlock_password("pw").await.unwrap(), *ldk);
        assert_eq!(
            v.unlock_password("nope").await.unwrap_err(),
            VaultError::WrongSecret
        );
    }

    #[tokio::test]
    async fn the_local_recovery_phrase_unlocks_and_sets_a_new_password() {
        let (_d, v) = vault();
        let (ldk, phrase) = v.setup_password("old").await.unwrap();
        assert_eq!(*v.unlock_recovery(&phrase, "new").await.unwrap(), *ldk);
        assert_eq!(*v.unlock_password("new").await.unwrap(), *ldk);
        assert_eq!(
            v.unlock_password("old").await.unwrap_err(),
            VaultError::WrongSecret
        );
        // The recovery phrase keeps working after being used.
        assert_eq!(*v.unlock_recovery(&phrase, "newer").await.unwrap(), *ldk);
    }

    #[tokio::test]
    async fn a_mistyped_phrase_is_a_wrong_secret() {
        let (_d, v) = vault();
        v.setup_password("pw").await.unwrap();
        let (_, _, _, _, other) = account("x");
        assert_eq!(
            v.unlock_recovery(&other, "n").await.unwrap_err(),
            VaultError::WrongSecret
        );
        assert_eq!(
            v.unlock_recovery("abandon abandon", "n").await.unwrap_err(),
            VaultError::WrongSecret
        );
    }

    #[tokio::test]
    async fn set_change_remove_password_round_trip() {
        let (_d, v) = vault();
        let ldk = v.setup_keychain().await.unwrap();
        let id = file(&v).vault_id;

        let phrase = v.set_password(&ldk, "one").unwrap();
        assert_eq!(v.status().state, "password");
        assert!(!v.keys.contains(&id));
        assert_eq!(*v.unlock_password("one").await.unwrap(), *ldk);

        assert_eq!(
            v.change_password("wrong", "two").unwrap_err(),
            VaultError::WrongSecret
        );
        v.change_password("one", "two").unwrap();
        assert_eq!(*v.unlock_password("two").await.unwrap(), *ldk);
        assert_eq!(*v.unlock_recovery(&phrase, "three").await.unwrap(), *ldk);

        v.remove_password("three").unwrap();
        assert_eq!(v.status().state, "keychain");
        assert!(file(&v).wrapped_ldk_recovery.is_none());
        assert_eq!(*v.unlock_keychain().await.unwrap(), *ldk);
    }

    #[tokio::test]
    async fn binding_an_account_replaces_the_local_password_and_keeps_the_old_phrase() {
        let (_d, v) = vault();
        let (ldk, local_phrase) = v.setup_password("local-pw").await.unwrap();
        let (dek, local_kek, salt, wdr, _) = account("account-pw");

        let local_dek = v.bind_account(&ldk, &local_kek, &salt, &dek, &wdr).unwrap();

        assert!(v.status().sync_bound);
        assert_eq!(*open_local_dek(&ldk, &local_dek).unwrap(), dek);
        assert_eq!(*v.unlock_password("account-pw").await.unwrap(), *ldk);
        assert_eq!(
            v.unlock_password("local-pw").await.unwrap_err(),
            VaultError::WrongSecret
        );
        assert_eq!(*v.unlock_recovery(&local_phrase, "n").await.unwrap(), *ldk);
    }

    #[tokio::test]
    async fn binding_from_keychain_mode_removes_the_keychain_entry() {
        let (_d, v) = vault();
        let ldk = v.setup_keychain().await.unwrap();
        let id = file(&v).vault_id;
        let (dek, local_kek, salt, wdr, _) = account("account-pw");
        v.bind_account(&ldk, &local_kek, &salt, &dek, &wdr).unwrap();
        assert_eq!(v.status().state, "password");
        assert!(!v.keys.contains(&id));
    }

    #[tokio::test]
    async fn the_account_recovery_phrase_opens_a_bound_vault_offline() {
        let (_d, v) = vault();
        let ldk = v.setup_keychain().await.unwrap();
        let (dek, local_kek, salt, wdr, account_phrase) = account("account-pw");
        v.bind_account(&ldk, &local_kek, &salt, &dek, &wdr).unwrap();
        assert_eq!(
            *v.unlock_recovery(&account_phrase, "fresh").await.unwrap(),
            *ldk
        );
        assert_eq!(*v.unlock_password("fresh").await.unwrap(), *ldk);
    }

    #[tokio::test]
    async fn a_bound_vault_refuses_to_drop_or_change_its_password() {
        let (_d, v) = vault();
        let ldk = v.setup_keychain().await.unwrap();
        let (dek, local_kek, salt, wdr, _) = account("account-pw");
        v.bind_account(&ldk, &local_kek, &salt, &dek, &wdr).unwrap();
        assert!(matches!(
            v.remove_password("account-pw"),
            Err(VaultError::InvalidState(_))
        ));
        assert!(matches!(
            v.change_password("account-pw", "x"),
            Err(VaultError::InvalidState(_))
        ));
    }

    #[tokio::test]
    async fn unbinding_keeps_the_account_password_as_the_local_one() {
        let (_d, v) = vault();
        let (ldk, local_phrase) = v.setup_password("local-pw").await.unwrap();
        let (dek, local_kek, salt, wdr, _) = account("account-pw");
        v.bind_account(&ldk, &local_kek, &salt, &dek, &wdr).unwrap();
        v.unbind_account(&ldk).unwrap();
        let f = file(&v);
        assert!(f.wrapped_ldk_by_dek.is_none() && f.wrapped_dek_recovery.is_none());
        assert!(!v.status().sync_bound);
        assert_eq!(v.status().state, "password");
        assert_eq!(*v.unlock_password("account-pw").await.unwrap(), *ldk);
        assert_eq!(*v.unlock_recovery(&local_phrase, "n").await.unwrap(), *ldk);
        v.remove_password("n").unwrap();
    }

    #[tokio::test]
    async fn unbinding_a_vault_with_no_local_recovery_returns_it_to_the_keychain() {
        let (_d, v) = vault();
        let ldk = v.setup_keychain().await.unwrap();
        let id = file(&v).vault_id;
        let (dek, local_kek, salt, wdr, _) = account("account-pw");
        v.bind_account(&ldk, &local_kek, &salt, &dek, &wdr).unwrap();

        v.unbind_account(&ldk).unwrap();

        // Left in password mode, the only way in would be the account password
        // with no recovery phrase behind it.
        let f = file(&v);
        assert_eq!(v.status().state, "keychain");
        assert!(!v.status().sync_bound);
        assert!(f.salt.is_none() && f.kdf.is_none() && f.wrapped_ldk.is_none());
        assert!(f.wrapped_ldk_by_dek.is_none() && f.wrapped_dek_recovery.is_none());
        assert_eq!(*v.keys.get(&id).unwrap(), *ldk);
        assert_eq!(*v.unlock_keychain().await.unwrap(), *ldk);
    }

    #[tokio::test]
    async fn a_denied_keychain_leaves_the_bound_vault_untouched_on_unbind() {
        let (_d, v) = vault();
        let ldk = v.setup_keychain().await.unwrap();
        let (dek, local_kek, salt, wdr, _) = account("account-pw");
        v.bind_account(&ldk, &local_kek, &salt, &dek, &wdr).unwrap();
        v.keys.deny();

        assert!(matches!(
            v.unbind_account(&ldk),
            Err(VaultError::KeychainDenied(_))
        ));
        assert_eq!(v.status().state, "password");
        assert!(v.status().sync_bound);
    }

    #[tokio::test]
    async fn a_legacy_database_is_migrated_by_setup() {
        let (d, v) = vault();
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(d.path().join(crate::db::DB_FILE))
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        sqlx::query("CREATE TABLE t (id TEXT)")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;
        assert_eq!(v.status().state, "legacy-plaintext");

        v.setup_keychain().await.unwrap();

        let s = v.status();
        assert_eq!((s.state, s.migrating), ("keychain", false));
        assert!(
            !crate::vault::migrate::is_plaintext_sqlite(&d.path().join(crate::db::DB_FILE))
                .unwrap()
        );
    }

    #[tokio::test]
    async fn an_interrupted_migration_is_finished_by_unlock() {
        let (d, v) = vault();
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(d.path().join(crate::db::DB_FILE))
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        sqlx::query("CREATE TABLE t (id TEXT)")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;
        // Simulate a crash right after vault.json was written.
        let ldk = generate_ldk();
        v.keys.set("id", &ldk).unwrap();
        save(
            d.path(),
            &VaultFile {
                version: FILE_VERSION,
                vault_id: "id".into(),
                mode: VaultMode::Keychain,
                salt: None,
                kdf: None,
                wrapped_ldk: None,
                wrapped_ldk_recovery: None,
                wrapped_ldk_by_dek: None,
                wrapped_dek_recovery: None,
                migration: Some(MigrationMarker::Pending),
            },
        )
        .unwrap();
        assert!(v.status().migrating);

        v.unlock_keychain().await.unwrap();

        assert!(!v.status().migrating);
        assert!(
            !crate::vault::migrate::is_plaintext_sqlite(&d.path().join(crate::db::DB_FILE))
                .unwrap()
        );
    }

    #[test]
    fn an_encrypted_database_without_vault_json_is_broken() {
        let (d, v) = vault();
        std::fs::write(d.path().join(crate::db::DB_FILE), [0xAAu8; 64]).unwrap();
        let s = v.status();
        assert_eq!(
            (s.state, s.broken_reason),
            ("broken", Some("vault-missing"))
        );
    }

    #[test]
    fn an_unreadable_vault_json_is_broken() {
        let (d, v) = vault();
        std::fs::write(d.path().join(VAULT_FILE), "{").unwrap();
        let s = v.status();
        assert_eq!((s.state, s.broken_reason), ("broken", Some("corrupt")));
    }

    #[test]
    fn an_empty_database_file_is_fresh() {
        let (d, v) = vault();
        std::fs::write(d.path().join(crate::db::DB_FILE), []).unwrap();
        assert_eq!(v.status().state, "fresh");
    }

    async fn legacy_db(dir: &std::path::Path) {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(dir.join(crate::db::DB_FILE))
                    .create_if_missing(true),
            )
            .await
            .unwrap();
        sqlx::query("CREATE TABLE t (id TEXT)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO t VALUES ('kept')")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;
    }

    #[tokio::test]
    async fn a_failed_migration_rolls_the_setup_back_so_a_retry_starts_clean() {
        let (d, v) = vault();
        legacy_db(d.path()).await;
        let obstacle = d.path().join(crate::vault::migrate::ENC_FILE);
        std::fs::create_dir(&obstacle).unwrap();

        assert!(v.setup_password("pw").await.is_err());
        assert_eq!(v.status().state, "legacy-plaintext");
        assert!(!d.path().join(VAULT_FILE).exists());
        let db = d.path().join(crate::db::DB_FILE);
        assert!(crate::vault::migrate::is_plaintext_sqlite(&db).unwrap());
        assert!(std::fs::read(&db).unwrap().windows(4).any(|w| w == b"kept"));

        std::fs::remove_dir(&obstacle).unwrap();
        v.setup_password("pw").await.unwrap();
        assert_eq!(v.status().state, "password");
    }

    #[tokio::test]
    async fn a_failed_keychain_migration_also_drops_the_keychain_entry() {
        let (d, v) = vault();
        legacy_db(d.path()).await;
        std::fs::create_dir(d.path().join(crate::vault::migrate::ENC_FILE)).unwrap();
        assert!(v.setup_keychain().await.is_err());
        assert_eq!(v.status().state, "legacy-plaintext");
        assert_eq!(v.keys.len(), 0);
    }

    #[tokio::test]
    async fn a_failed_keychain_delete_after_set_password_is_not_an_error_and_is_retried() {
        let (_d, v) = vault();
        let ldk = v.setup_keychain().await.unwrap();
        let id = file(&v).vault_id;
        v.keys.set_delete_denied(true);

        let phrase = v.set_password(&ldk, "pw").unwrap();
        assert_eq!(phrase.split_whitespace().count(), 24);
        assert!(v.keys.contains(&id));

        v.keys.set_delete_denied(false);
        assert_eq!(*v.unlock_password("pw").await.unwrap(), *ldk);
        assert!(!v.keys.contains(&id));
    }

    #[tokio::test]
    async fn a_failed_keychain_delete_after_bind_is_not_an_error() {
        let (_d, v) = vault();
        let ldk = v.setup_keychain().await.unwrap();
        let (dek, local_kek, salt, wdr, _) = account("account-pw");
        v.keys.set_delete_denied(true);
        assert!(v.bind_account(&ldk, &local_kek, &salt, &dek, &wdr).is_ok());
        assert_eq!(*v.unlock_password("account-pw").await.unwrap(), *ldk);
    }

    #[tokio::test]
    async fn a_foreign_ldk_is_refused_before_anything_changes() {
        let (_d, v) = vault();
        let ldk = v.setup_keychain().await.unwrap();
        let id = file(&v).vault_id;
        let other = generate_ldk();
        assert!(matches!(
            v.set_password(&other, "pw"),
            Err(VaultError::InvalidState(_))
        ));
        let (dek, local_kek, salt, wdr, _) = account("account-pw");
        assert!(matches!(
            v.bind_account(&other, &local_kek, &salt, &dek, &wdr),
            Err(VaultError::InvalidState(_))
        ));
        assert_eq!(v.status().state, "keychain");
        assert!(!v.status().sync_bound);
        assert_eq!(*v.keys.get(&id).unwrap(), *ldk);
    }

    #[tokio::test]
    async fn setup_refuses_to_overwrite_an_existing_vault() {
        let (_d, v) = vault();
        v.setup_keychain().await.unwrap();
        assert!(matches!(
            v.setup_password("pw").await,
            Err(VaultError::InvalidState(_))
        ));
    }
}
