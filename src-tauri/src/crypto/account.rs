use base64::Engine;
use serde::Serialize;
use zeroize::Zeroize;

use super::derive::{
    derive_auth_verifier, derive_kek, derive_master_key, generate_auth_salt, ARGON2_MEMORY_KIB,
    ARGON2_PARALLELISM, ARGON2_TIME_COST,
};
use super::identity::generate_identity;
use super::recovery::{generate_recovery_phrase, recovery_kek_from_phrase};
use super::wrap::{open, seal, AAD_DEK, AAD_DEK_RECOVERY, AAD_PRIVATE_KEY};
use super::CryptoError;

#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KdfParams {
    pub memory_cost: u32,
    pub time_cost: u32,
    pub parallelism: u32,
}

impl KdfParams {
    pub fn current() -> Self {
        Self {
            memory_cost: ARGON2_MEMORY_KIB,
            time_cost: ARGON2_TIME_COST,
            parallelism: ARGON2_PARALLELISM,
        }
    }
}

/// Everything POST /v1/auth/register needs, plus the recovery phrase — which is
/// shown to the user once and never sent anywhere.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationMaterial {
    pub auth_salt: String,
    pub auth_verifier: String,
    pub wrapped_dek: String,
    pub wrapped_dek_recovery: String,
    pub public_key: String,
    pub wrapped_private_key: String,
    pub kdf_params: KdfParams,
    pub recovery_phrase: String,
}

pub fn prepare_registration(password: &str) -> Result<RegistrationMaterial, CryptoError> {
    let auth_salt = generate_auth_salt();
    let mut master_key = derive_master_key(password, &auth_salt)?;
    let auth_verifier = derive_auth_verifier(&master_key);
    let mut kek = derive_kek(&master_key);
    master_key.zeroize();

    // One DEK, wrapped twice. The recovery phrase must open the same vault the
    // password does, or it is not a recovery path.
    let mut dek = [0u8; 32];
    getrandom::fill(&mut dek).expect("OS RNG unavailable");

    let wrapped_dek = seal(&kek, AAD_DEK, &dek);
    kek.zeroize();

    let recovery_phrase = generate_recovery_phrase();
    let mut recovery_kek = recovery_kek_from_phrase(&recovery_phrase)?;
    let wrapped_dek_recovery = seal(&recovery_kek, AAD_DEK_RECOVERY, &dek);
    recovery_kek.zeroize();

    let identity = generate_identity();
    let wrapped_private_key = seal(&dek, AAD_PRIVATE_KEY, &identity.private_key);
    let public_key = base64::engine::general_purpose::STANDARD.encode(identity.public_key);
    dek.zeroize();

    Ok(RegistrationMaterial {
        auth_salt,
        auth_verifier,
        wrapped_dek,
        wrapped_dek_recovery,
        public_key,
        wrapped_private_key,
        kdf_params: KdfParams::current(),
        recovery_phrase,
    })
}

/// Exactly what PUT /v1/keys accepts, and nothing more.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RotationMaterial {
    pub current_auth_verifier: String,
    pub auth_verifier: String,
    pub auth_salt: String,
    pub kdf_params: KdfParams,
    pub wrapped_dek: String,
}

// Hand-written because the two verifiers are the credentials the server
// authenticates against: a derived Debug would put them verbatim into any log
// line or panic message that formats this struct.
impl std::fmt::Debug for RotationMaterial {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RotationMaterial")
            .field("current_auth_verifier", &"<redacted>")
            .field("auth_verifier", &"<redacted>")
            .field("auth_salt", &self.auth_salt)
            .field("kdf_params", &self.kdf_params)
            .field("wrapped_dek", &self.wrapped_dek)
            .finish()
    }
}

/// Re-wraps the existing DEK under a new password. The DEK itself is unchanged,
/// which is what leaves the recovery phrase and the X25519 private key working.
pub fn prepare_key_rotation(
    current_password: &str,
    current_auth_salt: &str,
    new_password: &str,
    wrapped_dek: &str,
) -> Result<RotationMaterial, CryptoError> {
    let mut current_master = derive_master_key(current_password, current_auth_salt)?;
    let current_auth_verifier = derive_auth_verifier(&current_master);
    let mut current_kek = derive_kek(&current_master);
    current_master.zeroize();

    let opened = open(&current_kek, AAD_DEK, wrapped_dek);
    current_kek.zeroize();
    let mut dek: [u8; 32] = opened?
        .try_into()
        .map_err(|_| CryptoError::Input("wrapped DEK did not hold 32 bytes".into()))?;

    let auth_salt = generate_auth_salt();
    let mut new_master = derive_master_key(new_password, &auth_salt)?;
    let auth_verifier = derive_auth_verifier(&new_master);
    let mut new_kek = derive_kek(&new_master);
    new_master.zeroize();

    let rewrapped = seal(&new_kek, AAD_DEK, &dek);
    new_kek.zeroize();
    dek.zeroize();

    Ok(RotationMaterial {
        current_auth_verifier,
        auth_verifier,
        auth_salt,
        kdf_params: KdfParams::current(),
        wrapped_dek: rewrapped,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::derive::{derive_kek, derive_master_key};
    use crate::crypto::recovery::recovery_kek_from_phrase;
    use crate::crypto::wrap::{open, AAD_DEK, AAD_DEK_RECOVERY, AAD_PRIVATE_KEY};
    use base64::Engine;

    fn decoded_len(b64: &str) -> usize {
        base64::engine::general_purpose::STANDARD
            .decode(b64)
            .unwrap()
            .len()
    }

    #[test]
    fn salt_matches_the_server_format() {
        let m = prepare_registration("correct horse").unwrap();
        assert_eq!(m.auth_salt.len(), 32);
        assert!(m
            .auth_salt
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_uppercase()));
    }

    #[test]
    fn every_blob_fits_the_server_bounds() {
        // The server rejects wrapped secrets outside 40..=128 decoded bytes and
        // a public key outside 32..=64.
        let m = prepare_registration("correct horse").unwrap();
        for (name, blob) in [
            ("wrappedDek", &m.wrapped_dek),
            ("wrappedDekRecovery", &m.wrapped_dek_recovery),
            ("wrappedPrivateKey", &m.wrapped_private_key),
        ] {
            let n = decoded_len(blob);
            assert!((40..=128).contains(&n), "{name} decoded to {n} bytes");
        }
        let pk = decoded_len(&m.public_key);
        assert!((32..=64).contains(&pk), "publicKey decoded to {pk} bytes");
    }

    #[test]
    fn both_wrappings_hold_the_same_dek() {
        // If they diverged, the recovery phrase would open a different vault
        // than the password — silently, and only discovered in an emergency.
        let m = prepare_registration("correct horse").unwrap();
        let kek = derive_kek(&derive_master_key("correct horse", &m.auth_salt).unwrap());
        let rkek = recovery_kek_from_phrase(&m.recovery_phrase).unwrap();
        assert_eq!(
            open(&kek, AAD_DEK, &m.wrapped_dek).unwrap(),
            open(&rkek, AAD_DEK_RECOVERY, &m.wrapped_dek_recovery).unwrap()
        );
    }

    #[test]
    fn the_private_key_is_wrapped_by_the_dek_not_the_password() {
        // Spec §2.1: wrapping it under the DEK is what lets it survive a
        // password change untouched.
        let m = prepare_registration("correct horse").unwrap();
        let kek = derive_kek(&derive_master_key("correct horse", &m.auth_salt).unwrap());
        let dek: [u8; 32] = open(&kek, AAD_DEK, &m.wrapped_dek)
            .unwrap()
            .try_into()
            .unwrap();
        let private = open(&dek, AAD_PRIVATE_KEY, &m.wrapped_private_key).unwrap();
        assert_eq!(private.len(), 32);
        // And the KEK must not open it.
        assert!(open(&kek, AAD_PRIVATE_KEY, &m.wrapped_private_key).is_err());
    }

    #[test]
    fn the_verifier_matches_a_fresh_derivation() {
        let m = prepare_registration("correct horse").unwrap();
        let mk = derive_master_key("correct horse", &m.auth_salt).unwrap();
        assert_eq!(
            m.auth_verifier,
            crate::crypto::derive::derive_auth_verifier(&mk)
        );
    }

    #[test]
    fn kdf_params_are_the_spec_values() {
        let m = prepare_registration("correct horse").unwrap();
        assert_eq!(m.kdf_params.memory_cost, 65536);
        assert_eq!(m.kdf_params.time_cost, 3);
        assert_eq!(m.kdf_params.parallelism, 4);
    }

    #[test]
    fn two_registrations_share_nothing() {
        let a = prepare_registration("correct horse").unwrap();
        let b = prepare_registration("correct horse").unwrap();
        assert_ne!(a.auth_salt, b.auth_salt);
        assert_ne!(a.auth_verifier, b.auth_verifier);
        assert_ne!(a.recovery_phrase, b.recovery_phrase);
        assert_ne!(a.public_key, b.public_key);

        // The DEKs themselves, unwrapped. Comparing the sealed blobs would prove
        // nothing — each seal draws a fresh nonce — so an RNG that handed every
        // account the same data key would slip past every other test on the
        // branch: both wrappings would still agree, rotation would still keep
        // the DEK, and the whole scenario walk would still pass while every
        // vault in the fleet shared one key.
        let dek_of = |m: &RegistrationMaterial| {
            let kek = derive_kek(&derive_master_key("correct horse", &m.auth_salt).unwrap());
            open(&kek, AAD_DEK, &m.wrapped_dek).unwrap()
        };
        assert_ne!(dek_of(&a), dek_of(&b));
    }

    #[test]
    fn serialises_to_camel_case() {
        // This struct is the material, not a request body. RegisterDto nests the
        // four blobs under `keys`, accepts no kdfParams at all, and must never
        // see recoveryPhrase. TypeScript assembles the body — toRegisterKeys,
        // Task 10.
        let m = prepare_registration("correct horse").unwrap();
        let json = serde_json::to_value(&m).unwrap();
        for key in [
            "authSalt",
            "authVerifier",
            "wrappedDek",
            "wrappedDekRecovery",
            "publicKey",
            "wrappedPrivateKey",
            "kdfParams",
            "recoveryPhrase",
        ] {
            assert!(json.get(key).is_some(), "missing {key}");
        }
        let params = json.get("kdfParams").unwrap();
        for key in ["memoryCost", "timeCost", "parallelism"] {
            assert!(params.get(key).is_some(), "missing kdfParams.{key}");
        }
    }

    #[test]
    fn kdf_params_are_on_the_server_allow_list() {
        // KDF_PARAMS_ALLOWLIST holds exactly DEFAULT_KDF_PARAMS today. Anything
        // else makes PUT /v1/keys a 400: the server refuses to let a client
        // weaken its own Argon2id cost, since it cannot invert the hash to notice.
        let m = prepare_registration("correct horse").unwrap();
        assert_eq!(
            (
                m.kdf_params.memory_cost,
                m.kdf_params.time_cost,
                m.kdf_params.parallelism
            ),
            (65536, 3, 4)
        );
    }

    #[test]
    fn rotation_keeps_the_same_dek() {
        let m = prepare_registration("old password").unwrap();
        let r = prepare_key_rotation("old password", &m.auth_salt, "new password", &m.wrapped_dek)
            .unwrap();

        let old_kek = derive_kek(&derive_master_key("old password", &m.auth_salt).unwrap());
        let new_kek = derive_kek(&derive_master_key("new password", &r.auth_salt).unwrap());

        assert_eq!(
            open(&old_kek, AAD_DEK, &m.wrapped_dek).unwrap(),
            open(&new_kek, AAD_DEK, &r.wrapped_dek).unwrap()
        );
    }

    #[test]
    fn rotation_leaves_the_recovery_path_working() {
        // The recovery wrap is untouched, so it still opens the same DEK.
        let m = prepare_registration("old password").unwrap();
        let r = prepare_key_rotation("old password", &m.auth_salt, "new password", &m.wrapped_dek)
            .unwrap();

        let rkek = recovery_kek_from_phrase(&m.recovery_phrase).unwrap();
        let new_kek = derive_kek(&derive_master_key("new password", &r.auth_salt).unwrap());

        assert_eq!(
            open(&rkek, AAD_DEK_RECOVERY, &m.wrapped_dek_recovery).unwrap(),
            open(&new_kek, AAD_DEK, &r.wrapped_dek).unwrap()
        );
    }

    #[test]
    fn rotation_issues_a_fresh_salt_and_verifier() {
        let m = prepare_registration("old password").unwrap();
        let r = prepare_key_rotation("old password", &m.auth_salt, "new password", &m.wrapped_dek)
            .unwrap();
        assert_ne!(r.auth_salt, m.auth_salt);
        assert_ne!(r.auth_verifier, m.auth_verifier);
        assert_eq!(r.current_auth_verifier, m.auth_verifier);
    }

    #[test]
    fn rotation_refuses_a_wrong_current_password() {
        let m = prepare_registration("old password").unwrap();
        assert_eq!(
            prepare_key_rotation("wrong", &m.auth_salt, "new password", &m.wrapped_dek)
                .unwrap_err(),
            CryptoError::Decrypt
        );
    }

    #[test]
    fn rotation_serialises_to_the_field_names_put_keys_expects() {
        let m = prepare_registration("old password").unwrap();
        let r = prepare_key_rotation("old password", &m.auth_salt, "new password", &m.wrapped_dek)
            .unwrap();
        let json = serde_json::to_value(&r).unwrap();
        for key in [
            "currentAuthVerifier",
            "authVerifier",
            "authSalt",
            "kdfParams",
            "wrappedDek",
        ] {
            assert!(json.get(key).is_some(), "missing {key}");
        }
        // The endpoint no longer accepts the other three blobs, and sending them
        // would trip forbidNonWhitelisted.
        for key in ["wrappedDekRecovery", "publicKey", "wrappedPrivateKey"] {
            assert!(json.get(key).is_none(), "must not send {key}");
        }
    }
}
