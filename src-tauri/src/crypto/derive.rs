use argon2::{Algorithm, Argon2, Params, Version};
use hkdf::Hkdf;
use sha2::Sha256;

use super::CryptoError;

/// Spec §2.1. Raising these later requires the lazy re-derivation described
/// there — the server keeps each account's parameters so old accounts stay
/// usable, which is also why prelogin returns them.
pub const ARGON2_MEMORY_KIB: u32 = 65536;
pub const ARGON2_TIME_COST: u32 = 3;
pub const ARGON2_PARALLELISM: u32 = 4;

const INFO_AUTH_VERIFIER: &[u8] = b"usagi/auth-verifier/v1";
const INFO_KEK: &[u8] = b"usagi/kek/v1";

fn is_auth_salt(s: &str) -> bool {
    s.len() == 32
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Argon2id over the password, salted with the account's server-issued salt.
pub fn derive_master_key(password: &str, auth_salt: &str) -> Result<[u8; 32], CryptoError> {
    if !is_auth_salt(auth_salt) {
        return Err(CryptoError::Input(
            "auth salt must be 32 lowercase hex characters".into(),
        ));
    }
    let params = Params::new(
        ARGON2_MEMORY_KIB,
        ARGON2_TIME_COST,
        ARGON2_PARALLELISM,
        Some(32),
    )
    .map_err(|e| CryptoError::Input(e.to_string()))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut out = [0u8; 32];
    argon
        .hash_password_into(password.as_bytes(), auth_salt.as_bytes(), &mut out)
        .map_err(|e| CryptoError::Input(e.to_string()))?;
    Ok(out)
}

fn expand(master_key: &[u8; 32], info: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(None, master_key);
    let mut out = [0u8; 32];
    // Only fails when the output length exceeds 255 * HashLen; 32 never does.
    hk.expand(info, &mut out)
        .expect("32 bytes is a valid HKDF length");
    out
}

/// What the server receives and hashes again. HKDF rather than a second Argon2id
/// pass: the master key already carries 256 bits, so re-stretching buys nothing,
/// and the property that matters — the server cannot walk back to the wrapping
/// key — is exactly what a one-way KDF gives.
pub fn derive_auth_verifier(master_key: &[u8; 32]) -> String {
    hex::encode(expand(master_key, INFO_AUTH_VERIFIER))
}

/// Wraps the DEK. Never leaves the device.
pub fn derive_kek(master_key: &[u8; 32]) -> [u8; 32] {
    expand(master_key, INFO_KEK)
}

pub fn generate_auth_salt() -> String {
    let mut raw = [0u8; 16];
    getrandom::fill(&mut raw).expect("OS RNG unavailable");
    hex::encode(raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SALT: &str = "0123456789abcdef0123456789abcdef";

    #[test]
    fn master_key_is_deterministic() {
        assert_eq!(
            derive_master_key("correct horse", SALT).unwrap(),
            derive_master_key("correct horse", SALT).unwrap()
        );
    }

    #[test]
    fn master_key_changes_with_the_password() {
        assert_ne!(
            derive_master_key("correct horse", SALT).unwrap(),
            derive_master_key("correct horsf", SALT).unwrap()
        );
    }

    #[test]
    fn master_key_changes_with_the_salt() {
        let other = "fedcba9876543210fedcba9876543210";
        assert_ne!(
            derive_master_key("correct horse", SALT).unwrap(),
            derive_master_key("correct horse", other).unwrap()
        );
    }

    #[test]
    fn rejects_a_salt_that_is_not_32_lowercase_hex() {
        // The server enforces /^[a-f0-9]{32}$/ and refuses anything else, so a
        // client that produced another shape would fail at registration.
        for bad in [
            "0123456789ABCDEF0123456789ABCDEF",   // uppercase
            "0123456789abcdef",                   // too short
            "0123456789abcdef0123456789abcdefff", // too long
            "0123456789abcdef0123456789abcdeg",   // not hex
        ] {
            assert!(
                derive_master_key("pw", bad).is_err(),
                "should have rejected {bad}"
            );
        }
    }

    #[test]
    fn auth_verifier_and_kek_are_different() {
        // If these collided the server would hold the wrapping key.
        let mk = derive_master_key("correct horse", SALT).unwrap();
        let verifier = derive_auth_verifier(&mk);
        let kek = hex::encode(derive_kek(&mk));
        assert_ne!(verifier, kek);
    }

    #[test]
    fn auth_verifier_is_64_lowercase_hex() {
        let mk = derive_master_key("correct horse", SALT).unwrap();
        let v = derive_auth_verifier(&mk);
        assert_eq!(v.len(), 64);
        assert!(v
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_uppercase()));
    }

    #[test]
    fn generated_salts_match_the_server_format_and_differ() {
        let a = generate_auth_salt();
        let b = generate_auth_salt();
        assert_ne!(a, b);
        for s in [&a, &b] {
            assert_eq!(s.len(), 32);
            assert!(s
                .chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_uppercase()));
        }
    }

    #[test]
    fn argon2_parameters_match_the_spec() {
        assert_eq!(ARGON2_MEMORY_KIB, 65536);
        assert_eq!(ARGON2_TIME_COST, 3);
        assert_eq!(ARGON2_PARALLELISM, 4);
    }
}
