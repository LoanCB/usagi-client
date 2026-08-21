use std::sync::Mutex;

use zeroize::{Zeroize, Zeroizing};

use super::derive::{derive_auth_verifier, derive_kek, derive_master_key};
use super::recovery::recovery_kek_from_phrase;
use super::wrap::{open, AAD_DEK, AAD_DEK_RECOVERY};
use super::CryptoError;

/// Holds the unlocked vault. Nothing here is ever serialised or crosses IPC —
/// the frontend sends a password and receives blobs, never a key.
#[derive(Default)]
pub struct CryptoState {
    /// Held only between begin_unlock and complete_unlock, so a sign-in pays
    /// for Argon2id once rather than on both sides of the network round trip.
    pending_master_key: Option<[u8; 32]>,
    dek: Option<[u8; 32]>,
    user_id: Option<String>,
}

impl CryptoState {
    pub fn is_unlocked(&self) -> bool {
        self.dek.is_some()
    }

    /// Derives the master key and returns the verifier the server expects.
    pub fn begin_unlock(&mut self, password: &str, auth_salt: &str) -> Result<String, CryptoError> {
        // Drop any half-finished attempt before starting another.
        self.clear_pending();
        let mut master_key = derive_master_key(password, auth_salt)?;
        let verifier = derive_auth_verifier(&master_key);
        // `[u8; 32]` is Copy: the assignment leaves this binding intact, so the
        // local has to be scrubbed too — same hazard `complete_unlock` guards.
        self.pending_master_key = Some(master_key);
        master_key.zeroize();
        Ok(verifier)
    }

    pub fn complete_unlock(&mut self, wrapped_dek: &str, user_id: &str) -> Result<(), CryptoError> {
        // `[u8; 32]` is Copy, so this must zeroize the binding itself — zeroizing
        // a copy would leave the master key sitting in memory.
        let mut master_key = self.pending_master_key.take().ok_or(CryptoError::Locked)?;
        let mut kek = derive_kek(&master_key);
        master_key.zeroize();

        let opened = open(&kek, AAD_DEK, wrapped_dek);
        kek.zeroize();
        self.store_dek(opened?, user_id)
    }

    pub fn unlock_with_recovery(
        &mut self,
        phrase: &str,
        wrapped_dek_recovery: &str,
        user_id: &str,
    ) -> Result<(), CryptoError> {
        let mut recovery_kek = recovery_kek_from_phrase(phrase)?;
        let opened = open(&recovery_kek, AAD_DEK_RECOVERY, wrapped_dek_recovery);
        recovery_kek.zeroize();
        self.store_dek(opened?, user_id)
    }

    pub fn lock(&mut self) {
        self.clear_pending();
        if let Some(mut dek) = self.dek.take() {
            dek.zeroize();
        }
        self.user_id = None;
    }

    fn clear_pending(&mut self) {
        if let Some(mut mk) = self.pending_master_key.take() {
            mk.zeroize();
        }
    }

    fn store_dek(&mut self, opened: Vec<u8>, user_id: &str) -> Result<(), CryptoError> {
        let dek: [u8; 32] = opened
            .try_into()
            .map_err(|_| CryptoError::Input("wrapped DEK did not hold 32 bytes".into()))?;
        self.dek = Some(dek);
        self.user_id = Some(user_id.to_owned());
        Ok(())
    }
}

impl Drop for CryptoState {
    fn drop(&mut self) {
        self.lock();
    }
}

pub fn dek_and_user(state: &CryptoState) -> Result<([u8; 32], String), CryptoError> {
    match (&state.dek, &state.user_id) {
        (Some(dek), Some(user)) => Ok((*dek, user.clone())),
        _ => Err(CryptoError::Locked),
    }
}

type Managed<'a> = tauri::State<'a, Mutex<CryptoState>>;

fn with_state<T>(
    state: &Managed<'_>,
    f: impl FnOnce(&mut CryptoState) -> Result<T, CryptoError>,
) -> Result<T, String> {
    // Recover from poisoning rather than propagating it: every mutation here is
    // a single field assignment, so a panic cannot leave a half-built invariant
    // behind. Refusing would strand the DEK in memory with no way to reach
    // `lock` — the one command we most need to work after a panic.
    let mut guard = state.lock().unwrap_or_else(|e| e.into_inner());
    f(&mut guard).map_err(Into::into)
}

// The secrets IPC hands these commands are owned Strings that would otherwise be
// dropped unscrubbed. Moving them into `Zeroizing` reuses the same allocation
// and erases it on the way out.

#[tauri::command]
pub fn crypto_prepare_registration(
    password: String,
) -> Result<super::account::RegistrationMaterial, String> {
    let password = Zeroizing::new(password);
    super::account::prepare_registration(&password).map_err(Into::into)
}

#[tauri::command]
pub fn crypto_begin_unlock(
    password: String,
    auth_salt: String,
    state: Managed<'_>,
) -> Result<String, String> {
    let password = Zeroizing::new(password);
    with_state(&state, |s| s.begin_unlock(&password, &auth_salt))
}

#[tauri::command]
pub fn crypto_complete_unlock(
    wrapped_dek: String,
    user_id: String,
    state: Managed<'_>,
) -> Result<(), String> {
    with_state(&state, |s| s.complete_unlock(&wrapped_dek, &user_id))
}

#[tauri::command]
pub fn crypto_unlock_with_recovery(
    recovery_phrase: String,
    wrapped_dek_recovery: String,
    user_id: String,
    state: Managed<'_>,
) -> Result<(), String> {
    let recovery_phrase = Zeroizing::new(recovery_phrase);
    with_state(&state, |s| {
        s.unlock_with_recovery(&recovery_phrase, &wrapped_dek_recovery, &user_id)
    })
}

#[tauri::command]
pub fn crypto_lock(state: Managed<'_>) -> Result<(), String> {
    with_state(&state, |s| {
        s.lock();
        Ok(())
    })
}

#[tauri::command]
pub fn crypto_is_unlocked(state: Managed<'_>) -> Result<bool, String> {
    with_state(&state, |s| Ok(s.is_unlocked()))
}

#[tauri::command]
pub fn crypto_encrypt_record(
    entity_type: String,
    entity_id: String,
    plaintext: String,
    state: Managed<'_>,
) -> Result<String, String> {
    with_state(&state, |s| {
        super::records::encrypt_record(s, &entity_type, &entity_id, &plaintext)
    })
}

#[tauri::command]
pub fn crypto_decrypt_record(
    entity_type: String,
    entity_id: String,
    blob: String,
    state: Managed<'_>,
) -> Result<String, String> {
    with_state(&state, |s| {
        super::records::decrypt_record(s, &entity_type, &entity_id, &blob)
    })
}

#[tauri::command]
pub fn crypto_prepare_key_rotation(
    current_password: String,
    current_auth_salt: String,
    new_password: String,
    wrapped_dek: String,
) -> Result<super::account::RotationMaterial, String> {
    let current_password = Zeroizing::new(current_password);
    let new_password = Zeroizing::new(new_password);
    super::account::prepare_key_rotation(
        &current_password,
        &current_auth_salt,
        &new_password,
        &wrapped_dek,
    )
    .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::account::prepare_registration;

    #[test]
    fn starts_locked() {
        let state = CryptoState::default();
        assert!(!state.is_unlocked());
        assert_eq!(dek_and_user(&state).unwrap_err(), CryptoError::Locked);
    }

    #[test]
    fn the_password_path_unlocks() {
        let m = prepare_registration("correct horse").unwrap();
        let mut state = CryptoState::default();
        let verifier = state.begin_unlock("correct horse", &m.auth_salt).unwrap();
        assert_eq!(verifier, m.auth_verifier);
        state.complete_unlock(&m.wrapped_dek, "user-1").unwrap();
        assert!(state.is_unlocked());
        assert_eq!(dek_and_user(&state).unwrap().1, "user-1");
    }

    #[test]
    fn complete_unlock_without_begin_is_refused() {
        let m = prepare_registration("correct horse").unwrap();
        let mut state = CryptoState::default();
        assert_eq!(
            state.complete_unlock(&m.wrapped_dek, "user-1").unwrap_err(),
            CryptoError::Locked
        );
    }

    #[test]
    fn a_wrong_password_fails_at_complete_not_begin() {
        // begin_unlock cannot tell: it only derives. The mismatch surfaces when
        // the derived KEK fails to open the wrapped DEK.
        let m = prepare_registration("correct horse").unwrap();
        let mut state = CryptoState::default();
        state.begin_unlock("wrong horse", &m.auth_salt).unwrap();
        assert_eq!(
            state.complete_unlock(&m.wrapped_dek, "user-1").unwrap_err(),
            CryptoError::Decrypt
        );
        assert!(!state.is_unlocked());
    }

    #[test]
    fn the_recovery_path_unlocks_the_same_vault() {
        let m = prepare_registration("correct horse").unwrap();

        let mut by_password = CryptoState::default();
        by_password
            .begin_unlock("correct horse", &m.auth_salt)
            .unwrap();
        by_password
            .complete_unlock(&m.wrapped_dek, "user-1")
            .unwrap();

        let mut by_recovery = CryptoState::default();
        by_recovery
            .unlock_with_recovery(&m.recovery_phrase, &m.wrapped_dek_recovery, "user-1")
            .unwrap();

        assert_eq!(
            dek_and_user(&by_password).unwrap().0,
            dek_and_user(&by_recovery).unwrap().0
        );
    }

    #[test]
    fn a_wrong_recovery_phrase_is_refused() {
        let m = prepare_registration("correct horse").unwrap();
        let other = prepare_registration("other").unwrap();
        let mut state = CryptoState::default();
        assert_eq!(
            state
                .unlock_with_recovery(&other.recovery_phrase, &m.wrapped_dek_recovery, "user-1")
                .unwrap_err(),
            CryptoError::Decrypt
        );
        assert!(!state.is_unlocked());
    }

    #[test]
    fn locking_clears_everything() {
        let m = prepare_registration("correct horse").unwrap();
        let mut state = CryptoState::default();
        state.begin_unlock("correct horse", &m.auth_salt).unwrap();
        state.complete_unlock(&m.wrapped_dek, "user-1").unwrap();

        state.lock();

        assert!(!state.is_unlocked());
        assert_eq!(dek_and_user(&state).unwrap_err(), CryptoError::Locked);
    }

    #[test]
    fn beginning_a_second_unlock_discards_the_first() {
        // Otherwise a stale pending master key would linger after an abandoned
        // sign-in attempt.
        let a = prepare_registration("password a").unwrap();
        let b = prepare_registration("password b").unwrap();
        let mut state = CryptoState::default();
        state.begin_unlock("password a", &a.auth_salt).unwrap();
        state.begin_unlock("password b", &b.auth_salt).unwrap();
        assert_eq!(
            state.complete_unlock(&a.wrapped_dek, "user-1").unwrap_err(),
            CryptoError::Decrypt
        );
    }

    #[test]
    fn record_commands_refuse_while_locked() {
        let state = CryptoState::default();
        assert_eq!(
            crate::crypto::records::encrypt_record(&state, "task", "abc", "{}").unwrap_err(),
            CryptoError::Locked
        );
        assert_eq!(
            crate::crypto::records::decrypt_record(&state, "task", "abc", "AAAA").unwrap_err(),
            CryptoError::Locked
        );
    }
}
