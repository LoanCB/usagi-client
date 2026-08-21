use base64::Engine;
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::XChaCha20Poly1305;

use super::CryptoError;

pub const AAD_DEK: &[u8] = b"usagi/wrap/dek/v1";
pub const AAD_DEK_RECOVERY: &[u8] = b"usagi/wrap/dek-recovery/v1";
pub const AAD_PRIVATE_KEY: &[u8] = b"usagi/wrap/private-key/v1";

const NONCE_LEN: usize = 24;

fn b64() -> base64::engine::general_purpose::GeneralPurpose {
    base64::engine::general_purpose::STANDARD
}

/// Seals `plaintext` as `nonce ‖ ciphertext ‖ tag`, base64-encoded.
///
/// The nonce is prepended rather than stored separately so a blob is a single
/// opaque string end to end — the server never has to understand its parts.
pub fn seal(key: &[u8; 32], aad: &[u8], plaintext: &[u8]) -> String {
    let mut nonce = [0u8; NONCE_LEN];
    getrandom::fill(&mut nonce).expect("OS RNG unavailable");
    let cipher = XChaCha20Poly1305::new(key.into());
    let ciphertext = cipher
        .encrypt(
            &nonce.into(),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .expect("XChaCha20-Poly1305 encryption cannot fail on valid input");
    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    b64().encode(out)
}

pub fn open(key: &[u8; 32], aad: &[u8], blob: &str) -> Result<Vec<u8>, CryptoError> {
    let raw = b64()
        .decode(blob)
        .map_err(|_| CryptoError::Input("blob is not valid base64".into()))?;
    if raw.len() <= NONCE_LEN {
        return Err(CryptoError::Input("blob is shorter than its nonce".into()));
    }
    let (nonce, ciphertext) = raw.split_at(NONCE_LEN);
    let nonce: [u8; NONCE_LEN] = nonce.try_into().expect("checked length above");
    let cipher = XChaCha20Poly1305::new(key.into());
    cipher
        .decrypt(
            &nonce.into(),
            Payload {
                msg: ciphertext,
                aad,
            },
        )
        // Every failure mode collapses to one error on purpose: telling a wrong
        // key from altered data from a mismatched AAD would leak which it was.
        .map_err(|_| CryptoError::Decrypt)
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: [u8; 32] = [7u8; 32];
    const OTHER: [u8; 32] = [8u8; 32];

    #[test]
    fn round_trips() {
        let blob = seal(&KEY, AAD_DEK, b"a 32-byte secret goes here......");
        assert_eq!(
            open(&KEY, AAD_DEK, &blob).unwrap(),
            b"a 32-byte secret goes here......"
        );
    }

    #[test]
    fn a_wrapped_32_byte_secret_fits_the_server_bounds() {
        // The server rejects wrapped secrets outside 40..=128 decoded bytes.
        let blob = seal(&KEY, AAD_DEK, &[0u8; 32]);
        let decoded = base64_len(&blob);
        assert_eq!(decoded, 72, "24 nonce + 32 plaintext + 16 tag");
        assert!((40..=128).contains(&decoded));
    }

    #[test]
    fn every_seal_uses_a_fresh_nonce() {
        assert_ne!(seal(&KEY, AAD_DEK, b"same"), seal(&KEY, AAD_DEK, b"same"));
    }

    #[test]
    fn rejects_the_wrong_key() {
        let blob = seal(&KEY, AAD_DEK, b"secret");
        assert_eq!(open(&OTHER, AAD_DEK, &blob), Err(CryptoError::Decrypt));
    }

    #[test]
    fn rejects_a_different_aad() {
        // This is what stops a hostile server moving one account's wrapped DEK
        // into another slot.
        let blob = seal(&KEY, AAD_DEK, b"secret");
        assert_eq!(
            open(&KEY, AAD_DEK_RECOVERY, &blob),
            Err(CryptoError::Decrypt)
        );
    }

    #[test]
    fn rejects_altered_ciphertext() {
        let blob = seal(&KEY, AAD_DEK, b"secret");
        let mut raw = base64_decode(&blob);
        let last = raw.len() - 1;
        raw[last] ^= 0x01;
        let tampered = base64_encode(&raw);
        assert_eq!(open(&KEY, AAD_DEK, &tampered), Err(CryptoError::Decrypt));
    }

    #[test]
    fn rejects_a_blob_too_short_to_hold_a_nonce() {
        assert!(matches!(
            open(&KEY, AAD_DEK, &base64_encode(&[0u8; 10])),
            Err(CryptoError::Input(_))
        ));
    }

    #[test]
    fn rejects_invalid_base64() {
        assert!(matches!(
            open(&KEY, AAD_DEK, "not base64!!"),
            Err(CryptoError::Input(_))
        ));
    }

    fn base64_decode(s: &str) -> Vec<u8> {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.decode(s).unwrap()
    }
    fn base64_encode(b: &[u8]) -> String {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(b)
    }
    fn base64_len(s: &str) -> usize {
        base64_decode(s).len()
    }
}
