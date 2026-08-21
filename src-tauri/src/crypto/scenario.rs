//! One scenario walking the whole lifecycle. The per-module tests each prove a
//! property in isolation; this proves they compose — which is where a mismatched
//! AAD or a rotated DEK would actually surface.

#[cfg(test)]
mod tests {
    use crate::crypto::account::{prepare_key_rotation, prepare_registration};
    use crate::crypto::records::{decrypt_record, encrypt_record};
    use crate::crypto::state::CryptoState;

    #[test]
    fn register_lock_unlock_rotate_and_recover() {
        // 1. Register.
        let m = prepare_registration("first password").unwrap();

        // 2. Unlock with the password and write a record.
        let mut vault = CryptoState::default();
        let verifier = vault.begin_unlock("first password", &m.auth_salt).unwrap();
        assert_eq!(
            verifier, m.auth_verifier,
            "the server would reject a mismatch"
        );
        vault.complete_unlock(&m.wrapped_dek, "user-1").unwrap();
        let blob = encrypt_record(&vault, "task", "t-1", r#"{"title":"pain"}"#).unwrap();

        // 3. Lock. The record must be unreadable.
        vault.lock();
        assert!(decrypt_record(&vault, "task", "t-1", &blob).is_err());

        // 4. Unlock again with the password: the record reads back.
        vault.begin_unlock("first password", &m.auth_salt).unwrap();
        vault.complete_unlock(&m.wrapped_dek, "user-1").unwrap();
        assert_eq!(
            decrypt_record(&vault, "task", "t-1", &blob).unwrap(),
            r#"{"title":"pain"}"#
        );

        // 5. Unlock a fresh vault with the recovery phrase instead.
        let mut recovered = CryptoState::default();
        recovered
            .unlock_with_recovery(&m.recovery_phrase, &m.wrapped_dek_recovery, "user-1")
            .unwrap();
        assert_eq!(
            decrypt_record(&recovered, "task", "t-1", &blob).unwrap(),
            r#"{"title":"pain"}"#
        );

        // 6. Change the password.
        let r = prepare_key_rotation(
            "first password",
            &m.auth_salt,
            "second password",
            &m.wrapped_dek,
        )
        .unwrap();

        // 7. The new password reads the record written under the old one.
        let mut rotated = CryptoState::default();
        rotated
            .begin_unlock("second password", &r.auth_salt)
            .unwrap();
        rotated.complete_unlock(&r.wrapped_dek, "user-1").unwrap();
        assert_eq!(
            decrypt_record(&rotated, "task", "t-1", &blob).unwrap(),
            r#"{"title":"pain"}"#
        );

        // 8. And the original recovery phrase still works — the whole point of
        //    re-wrapping rather than regenerating the DEK.
        let mut recovered_again = CryptoState::default();
        recovered_again
            .unlock_with_recovery(&m.recovery_phrase, &m.wrapped_dek_recovery, "user-1")
            .unwrap();
        assert_eq!(
            decrypt_record(&recovered_again, "task", "t-1", &blob).unwrap(),
            r#"{"title":"pain"}"#
        );

        // 9. The old password no longer opens the new wrap.
        let mut stale = CryptoState::default();
        stale.begin_unlock("first password", &r.auth_salt).unwrap();
        assert!(stale.complete_unlock(&r.wrapped_dek, "user-1").is_err());
    }
}
