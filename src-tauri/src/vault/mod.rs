//! Local database encryption. See docs/superpowers/specs/2026-09-28-local-encryption-design.md.

pub mod commands;
pub mod file;
pub mod keys;
pub mod keystore;
pub mod migrate;
pub mod service;

use serde::Serialize;

use crate::crypto::CryptoError;

/// What the frontend can tell apart. Deliberately no distinction between a
/// wrong password and a wrong recovery phrase, or between a bad phrase
/// checksum and a phrase that opens nothing: each would leak which input was
/// close.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "code", content = "detail", rename_all = "kebab-case")]
pub enum VaultError {
    WrongSecret,
    KeychainDenied(String),
    KeyMissing,
    Corrupt(String),
    MigrationFailed(String),
    Io(String),
    InvalidState(String),
}

impl From<std::io::Error> for VaultError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e.to_string())
    }
}

impl From<CryptoError> for VaultError {
    fn from(e: CryptoError) -> Self {
        match e {
            // A malformed phrase (bad BIP39 checksum, wrong word) is a wrong secret
            // from the user's point of view.
            CryptoError::Decrypt | CryptoError::Input(_) | CryptoError::Locked => Self::WrongSecret,
        }
    }
}
