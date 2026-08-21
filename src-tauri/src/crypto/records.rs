use super::state::{dek_and_user, CryptoState};
use super::wrap::{open, seal};
use super::CryptoError;
use zeroize::Zeroize;

/// Record AADs and the fixed `AAD_*` constants are all used under the DEK, so
/// they must be distinguishable. A separator scheme got that incidentally
/// ("record AADs contain 0x1F, the constants do not"); length-prefixing does
/// not, so the domain is stated outright.
const AAD_RECORD_DOMAIN: &[u8] = b"usagi/record/v1";

fn push_field(aad: &mut Vec<u8>, field: &[u8]) {
    // Fixed-width length prefix: a collision between two different field
    // triples becomes structurally impossible rather than merely rejected,
    // so no caller can bypass the guarantee by building an AAD directly.
    aad.extend_from_slice(&(field.len() as u64).to_be_bytes());
    aad.extend_from_slice(field);
}

pub fn record_aad(user_id: &str, entity_type: &str, entity_id: &str) -> Vec<u8> {
    let mut aad = Vec::with_capacity(32 + user_id.len() + entity_type.len() + entity_id.len());
    push_field(&mut aad, AAD_RECORD_DOMAIN);
    push_field(&mut aad, user_id.as_bytes());
    push_field(&mut aad, entity_type.as_bytes());
    push_field(&mut aad, entity_id.as_bytes());
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
    fn length_prefixing_prevents_field_boundary_confusion() {
        // Without length prefixes, ("ab","c") and ("a","bc") would build the
        // same AAD, and a blob could slide between them.
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
    fn a_unit_separator_inside_a_field_is_just_data() {
        // Under the old separator scheme 0x1F had to be rejected outright. With
        // length prefixes it carries no structural meaning, so identifiers
        // holding one encrypt and decrypt like any others.
        let state = unlocked();
        let blob = encrypt_record(&state, "ta\u{1F}sk", "ab\u{1F}c", r#"{"n":1}"#).unwrap();
        assert_eq!(
            decrypt_record(&state, "ta\u{1F}sk", "ab\u{1F}c", &blob).unwrap(),
            r#"{"n":1}"#
        );
    }

    #[test]
    fn a_smuggled_separator_no_longer_forges_a_field_boundary() {
        // Under the old scheme these two triples built byte-identical AADs and a
        // blob could slide between them, which is why both had to be refused.
        // Length prefixes make the collision impossible rather than rejected.
        assert_ne!(
            record_aad("user-1", "a\u{1F}b", "c"),
            record_aad("user-1", "a", "b\u{1F}c")
        );

        let state = unlocked();
        let blob = encrypt_record(&state, "a\u{1F}b", "c", "{}").unwrap();
        assert!(matches!(
            decrypt_record(&state, "a", "b\u{1F}c", &blob),
            Err(CryptoError::Decrypt)
        ));
    }

    #[test]
    fn the_aad_layout_is_pinned() {
        // The AAD is part of the wire format: changing its encoding makes every
        // stored blob undecryptable. This vector is written out by hand from the
        // documented layout, not pasted from what the code prints.
        let mut expected = Vec::new();
        for field in [b"usagi/record/v1".as_slice(), b"u", b"t", b"i"] {
            expected.extend_from_slice(&(field.len() as u64).to_be_bytes());
            expected.extend_from_slice(field);
        }
        assert_eq!(record_aad("u", "t", "i"), expected);
        assert_eq!(expected.len(), 8 * 4 + 15 + 3);
    }

    #[test]
    fn the_aad_is_domain_separated_from_the_fixed_wrapping_aads() {
        // Record AADs and the AAD_* constants are used under the same DEK, so a
        // record must never be openable as a wrapped private key or vice versa.
        for fixed in [
            crate::crypto::wrap::AAD_DEK,
            crate::crypto::wrap::AAD_DEK_RECOVERY,
            crate::crypto::wrap::AAD_PRIVATE_KEY,
        ] {
            assert_ne!(record_aad("user-1", "task", "abc"), fixed.to_vec());
        }
        assert!(record_aad("user-1", "task", "abc")
            .windows(AAD_RECORD_DOMAIN.len())
            .any(|w| w == AAD_RECORD_DOMAIN));
    }
}
