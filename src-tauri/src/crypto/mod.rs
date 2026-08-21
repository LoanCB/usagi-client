pub mod account;
pub mod derive;
pub mod identity;
pub mod records;
pub mod recovery;
pub mod state;
pub mod wrap;

use std::fmt;

/// Every failure the crypto layer can surface to the frontend.
///
/// Deliberately coarse: a caller must not be able to tell a wrong password from
/// altered ciphertext from a mismatched entity id, because each of those
/// distinctions leaks something to an attacker holding the blobs.
#[derive(Debug, PartialEq, Eq)]
pub enum CryptoError {
    /// A command needing keys was called before `unlock`.
    Locked,
    /// Anything that went wrong opening a sealed blob.
    Decrypt,
    /// Input that is malformed on its face — bad base64, wrong length.
    Input(String),
}

impl fmt::Display for CryptoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Locked => write!(f, "the vault is locked"),
            Self::Decrypt => write!(
                f,
                "decryption failed: wrong key, altered data, or mismatched context"
            ),
            Self::Input(what) => write!(f, "invalid input: {what}"),
        }
    }
}

// Tauri commands return Result<T, String>; this keeps that conversion in one place.
impl From<CryptoError> for String {
    fn from(e: CryptoError) -> Self {
        e.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_messages_are_human_readable() {
        assert_eq!(CryptoError::Locked.to_string(), "the vault is locked");
        assert_eq!(
            CryptoError::Decrypt.to_string(),
            "decryption failed: wrong key, altered data, or mismatched context"
        );
    }
}
