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

/// `record_aad` joins its three fields with `SEP`, so the AAD only identifies one
/// triple as long as no field embeds that byte itself. A smuggled separator
/// forges a boundary: ("a\x1Fb", "c") and ("a", "b\x1Fc") build byte-identical
/// AADs, which would let a hostile server slide one entity's ciphertext into the
/// other entity's row — the exact substitution the AAD exists to prevent.
fn reject_embedded_separator(
    user_id: &str,
    entity_type: &str,
    entity_id: &str,
) -> Result<(), CryptoError> {
    if [user_id, entity_type, entity_id]
        .iter()
        .any(|part| part.as_bytes().contains(&SEP))
    {
        return Err(CryptoError::Input(
            "record identifiers must not contain a field separator".into(),
        ));
    }
    Ok(())
}

pub fn encrypt_record(
    state: &CryptoState,
    entity_type: &str,
    entity_id: &str,
    plaintext: &str,
) -> Result<String, CryptoError> {
    let (mut dek, user_id) = dek_and_user(state)?;
    // Scrub the key before propagating: a rejected identifier must not leave it live.
    if let Err(e) = reject_embedded_separator(&user_id, entity_type, entity_id) {
        dek.zeroize();
        return Err(e);
    }
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
    // Scrub the key before propagating: a rejected identifier must not leave it live.
    if let Err(e) = reject_embedded_separator(&user_id, entity_type, entity_id) {
        dek.zeroize();
        return Err(e);
    }
    let aad = record_aad(&user_id, entity_type, entity_id);
    let opened = open(&dek, &aad, blob);
    dek.zeroize();
    String::from_utf8(opened?).map_err(|_| CryptoError::Input("record is not valid UTF-8".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::account::prepare_registration;
    use crate::crypto::wrap::{open, seal};

    const KEY: [u8; 32] = [9u8; 32];

    fn unlocked() -> CryptoState {
        let m = prepare_registration("correct horse").unwrap();
        let mut state = CryptoState::default();
        state.begin_unlock("correct horse", &m.auth_salt).unwrap();
        state.complete_unlock(&m.wrapped_dek, "user-1").unwrap();
        state
    }

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

    #[test]
    fn encrypting_refuses_a_separator_in_the_entity_type() {
        let state = unlocked();
        assert!(matches!(
            encrypt_record(&state, "ta\u{1F}sk", "abc", "{}"),
            Err(CryptoError::Input(_))
        ));
    }

    #[test]
    fn encrypting_refuses_a_separator_in_the_entity_id() {
        let state = unlocked();
        assert!(matches!(
            encrypt_record(&state, "task", "ab\u{1F}c", "{}"),
            Err(CryptoError::Input(_))
        ));
    }

    #[test]
    fn decrypting_refuses_a_separator_in_an_identifier() {
        let state = unlocked();
        let blob = encrypt_record(&state, "task", "abc", "{}").unwrap();
        assert!(matches!(
            decrypt_record(&state, "ta\u{1F}sk", "abc", &blob),
            Err(CryptoError::Input(_))
        ));
        assert!(matches!(
            decrypt_record(&state, "task", "ab\u{1F}c", &blob),
            Err(CryptoError::Input(_))
        ));
    }

    #[test]
    fn identifiers_that_would_share_an_aad_are_both_refused() {
        // A separator inside a field forges a boundary: these two triples build
        // byte-identical AADs, so without the check a blob could still slide from
        // one entity to the other. Refusing both is what closes that door.
        assert_eq!(
            record_aad("user-1", "a\u{1F}b", "c"),
            record_aad("user-1", "a", "b\u{1F}c")
        );
        let state = unlocked();
        assert!(matches!(
            encrypt_record(&state, "a\u{1F}b", "c", "{}"),
            Err(CryptoError::Input(_))
        ));
        assert!(matches!(
            encrypt_record(&state, "a", "b\u{1F}c", "{}"),
            Err(CryptoError::Input(_))
        ));
    }
}
