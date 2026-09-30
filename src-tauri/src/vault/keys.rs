use hkdf::Hkdf;
use sha2::Sha256;
use zeroize::{Zeroize, Zeroizing};

use crate::crypto::derive::derive_master_key;
use crate::crypto::recovery::recovery_kek_from_phrase;
use crate::crypto::wrap::{open, seal};
use crate::crypto::CryptoError;

pub type Key = Zeroizing<[u8; 32]>;

pub const AAD_LDK: &[u8] = b"usagi/wrap/ldk/v1";
pub const AAD_LDK_RECOVERY: &[u8] = b"usagi/wrap/ldk-recovery/v1";
pub const AAD_LDK_DEK: &[u8] = b"usagi/wrap/ldk-dek/v1";
pub const AAD_LOCAL_DEK: &[u8] = b"usagi/wrap/local-dek/v1";
pub const AAD_LOCAL_BACKUP: &[u8] = b"usagi/local-backup/v1";

const INFO_LOCAL_KEK: &[u8] = b"usagi/local-kek/v1";
const INFO_LOCAL_DEK: &[u8] = b"usagi/local-dek/v1";
const INFO_LOCAL_BACKUP: &[u8] = b"usagi/local-backup/v1";

fn hkdf32(ikm: &[u8; 32], info: &[u8]) -> Key {
    let hk = Hkdf::<Sha256>::new(None, ikm);
    let mut out = Zeroizing::new([0u8; 32]);
    hk.expand(info, out.as_mut())
        .expect("32 bytes is a valid HKDF length");
    out
}

pub fn generate_ldk() -> Key {
    let mut key = Zeroizing::new([0u8; 32]);
    getrandom::fill(key.as_mut()).expect("OS RNG unavailable");
    key
}

pub fn local_kek_from_master(master_key: &[u8; 32]) -> Key {
    hkdf32(master_key, INFO_LOCAL_KEK)
}

pub fn local_kek_from_password(password: &str, salt: &str) -> Result<Key, CryptoError> {
    let mut master = derive_master_key(password, salt)?;
    let kek = local_kek_from_master(&master);
    master.zeroize();
    Ok(kek)
}

pub fn recovery_kek(phrase: &str) -> Result<Key, CryptoError> {
    Ok(Zeroizing::new(recovery_kek_from_phrase(phrase)?))
}

pub fn wrap_key(kek: &[u8; 32], aad: &[u8], key: &[u8; 32]) -> String {
    seal(kek, aad, key)
}

pub fn unwrap_key(kek: &[u8; 32], aad: &[u8], blob: &str) -> Result<Key, CryptoError> {
    let opened = Zeroizing::new(open(kek, aad, blob)?);
    let bytes: [u8; 32] = opened
        .as_slice()
        .try_into()
        .map_err(|_| CryptoError::Input("wrapped key did not hold 32 bytes".into()))?;
    Ok(Zeroizing::new(bytes))
}

pub fn seal_local_dek(ldk: &[u8; 32], dek: &[u8; 32]) -> String {
    seal(&hkdf32(ldk, INFO_LOCAL_DEK), AAD_LOCAL_DEK, dek)
}

pub fn open_local_dek(ldk: &[u8; 32], blob: &str) -> Result<Key, CryptoError> {
    unwrap_key(&hkdf32(ldk, INFO_LOCAL_DEK), AAD_LOCAL_DEK, blob)
}

pub fn seal_backup(ldk: &[u8; 32], plaintext: &[u8]) -> String {
    seal(&hkdf32(ldk, INFO_LOCAL_BACKUP), AAD_LOCAL_BACKUP, plaintext)
}

pub fn open_backup(ldk: &[u8; 32], blob: &str) -> Result<Vec<u8>, CryptoError> {
    open(&hkdf32(ldk, INFO_LOCAL_BACKUP), AAD_LOCAL_BACKUP, blob)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::derive::{derive_master_key, generate_auth_salt};
    use crate::crypto::recovery::generate_recovery_phrase;

    const SALT: &str = "0123456789abcdef0123456789abcdef";

    #[test]
    fn two_ldks_differ() {
        assert_ne!(*generate_ldk(), *generate_ldk());
    }

    #[test]
    fn the_password_path_round_trips() {
        let ldk = generate_ldk();
        let kek = local_kek_from_password("pw", SALT).unwrap();
        let blob = wrap_key(&kek, AAD_LDK, &ldk);
        assert_eq!(*unwrap_key(&kek, AAD_LDK, &blob).unwrap(), *ldk);
    }

    #[test]
    fn a_wrong_password_does_not_unwrap() {
        let ldk = generate_ldk();
        let blob = wrap_key(&local_kek_from_password("pw", SALT).unwrap(), AAD_LDK, &ldk);
        let wrong = local_kek_from_password("pX", SALT).unwrap();
        assert_eq!(
            unwrap_key(&wrong, AAD_LDK, &blob).unwrap_err(),
            CryptoError::Decrypt
        );
    }

    #[test]
    fn the_local_kek_is_not_the_account_kek() {
        // Same master key, different HKDF domain: a database key must never
        // equal the key that wraps the account DEK.
        let master = derive_master_key("pw", SALT).unwrap();
        assert_ne!(
            *local_kek_from_master(&master),
            crate::crypto::derive::derive_kek(&master)
        );
    }

    #[test]
    fn from_password_equals_from_master() {
        let master = derive_master_key("pw", SALT).unwrap();
        assert_eq!(
            *local_kek_from_password("pw", SALT).unwrap(),
            *local_kek_from_master(&master)
        );
    }

    #[test]
    fn an_aad_mismatch_is_refused() {
        let ldk = generate_ldk();
        let kek = local_kek_from_password("pw", &generate_auth_salt()).unwrap();
        let blob = wrap_key(&kek, AAD_LDK, &ldk);
        assert!(unwrap_key(&kek, AAD_LDK_RECOVERY, &blob).is_err());
    }

    #[test]
    fn the_recovery_path_round_trips_despite_sloppy_typing() {
        let ldk = generate_ldk();
        let phrase = generate_recovery_phrase();
        let blob = wrap_key(&recovery_kek(&phrase).unwrap(), AAD_LDK_RECOVERY, &ldk);
        let retyped = format!("  {}  ", phrase.to_uppercase().replace(' ', "   "));
        let rk = recovery_kek(&retyped).unwrap();
        assert_eq!(*unwrap_key(&rk, AAD_LDK_RECOVERY, &blob).unwrap(), *ldk);
    }

    #[test]
    fn the_local_dek_round_trips_and_is_bound_to_the_ldk() {
        let ldk = generate_ldk();
        let dek = [9u8; 32];
        let blob = seal_local_dek(&ldk, &dek);
        assert_eq!(*open_local_dek(&ldk, &blob).unwrap(), dek);
        assert!(open_local_dek(&generate_ldk(), &blob).is_err());
    }

    #[test]
    fn a_backup_round_trips_and_is_bound_to_the_ldk() {
        let ldk = generate_ldk();
        let blob = seal_backup(&ldk, b"{\"version\":1}");
        assert_eq!(open_backup(&ldk, &blob).unwrap(), b"{\"version\":1}");
        assert!(open_backup(&generate_ldk(), &blob).is_err());
    }
}
