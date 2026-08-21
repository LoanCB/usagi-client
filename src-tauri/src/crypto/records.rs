use super::state::{dek_and_user, CryptoState};
use super::wrap::{open, seal};
use super::CryptoError;
use zeroize::Zeroize;

/// ASCII unit separator. Without it, ("ab","c") and ("a","bc") would produce the
/// same AAD and a blob could be slid from one entity to the other.
const SEP: u8 = 0x1F;

pub fn record_aad(user_id: &str, entity_type: &str, entity_id: &str) -> Vec<u8> {
    let mut aad = Vec::with_capacity(user_id.len() + entity_type.len() + entity_id.len() + 2);
    aad.extend_from_slice(user_id.as_bytes());
    aad.push(SEP);
    aad.extend_from_slice(entity_type.as_bytes());
    aad.push(SEP);
    aad.extend_from_slice(entity_id.as_bytes());
    aad
}

pub fn encrypt_record(
    state: &CryptoState,
    entity_type: &str,
    entity_id: &str,
    plaintext: &str,
) -> Result<String, CryptoError> {
    let (mut dek, user_id) = dek_and_user(state)?;
    let aad = record_aad(&user_id, entity_type, entity_id);
    let blob = seal(&dek, &aad, plaintext.as_bytes());
    dek.zeroize();
    Ok(blob)
}

pub fn decrypt_record(
    state: &CryptoState,
    entity_type: &str,
    entity_id: &str,
    blob: &str,
) -> Result<String, CryptoError> {
    let (mut dek, user_id) = dek_and_user(state)?;
    let aad = record_aad(&user_id, entity_type, entity_id);
    let opened = open(&dek, &aad, blob);
    dek.zeroize();
    String::from_utf8(opened?).map_err(|_| CryptoError::Input("record is not valid UTF-8".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::wrap::{open, seal};

    const KEY: [u8; 32] = [9u8; 32];

    #[test]
    fn a_record_round_trips() {
        let aad = record_aad("user-1", "task", "abc");
        let blob = seal(&KEY, &aad, br#"{"title":"pain"}"#);
        assert_eq!(open(&KEY, &aad, &blob).unwrap(), br#"{"title":"pain"}"#);
    }

    #[test]
    fn a_blob_cannot_be_moved_to_another_entity() {
        // The attack this stops: a hostile server swapping one task's ciphertext
        // into another task's row.
        let blob = seal(&KEY, &record_aad("user-1", "task", "abc"), b"secret");
        assert!(open(&KEY, &record_aad("user-1", "task", "xyz"), &blob).is_err());
    }

    #[test]
    fn a_blob_cannot_be_moved_to_another_entity_type() {
        let blob = seal(&KEY, &record_aad("user-1", "task", "abc"), b"secret");
        assert!(open(&KEY, &record_aad("user-1", "project", "abc"), &blob).is_err());
    }

    #[test]
    fn a_blob_cannot_be_moved_to_another_account() {
        let blob = seal(&KEY, &record_aad("user-1", "task", "abc"), b"secret");
        assert!(open(&KEY, &record_aad("user-2", "task", "abc"), &blob).is_err());
    }

    #[test]
    fn the_separator_prevents_field_boundary_confusion() {
        // Without a separator, ("ab","c") and ("a","bc") would build the same
        // AAD, and a blob could slide between them.
        assert_ne!(record_aad("u", "ab", "c"), record_aad("u", "a", "bc"));
    }

    #[test]
    fn the_aad_contains_all_three_parts() {
        let aad = record_aad("user-1", "task", "abc");
        let text = String::from_utf8_lossy(&aad);
        assert!(text.contains("user-1"));
        assert!(text.contains("task"));
        assert!(text.contains("abc"));
    }
}
