use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::VaultError;
use crate::crypto::account::KdfParams;

pub const VAULT_FILE: &str = "vault.json";
pub const FILE_VERSION: u32 = 1;
const TMP_FILE: &str = "vault.json.tmp";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VaultMode {
    Keychain,
    Password,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MigrationMarker {
    Pending,
}

/// Holds wrappings only — every field is either public metadata or a blob
/// sealed under a key that is not in this file.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultFile {
    pub version: u32,
    pub vault_id: String,
    pub mode: VaultMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub salt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kdf: Option<KdfParams>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrapped_ldk: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrapped_ldk_recovery: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrapped_ldk_by_dek: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wrapped_dek_recovery: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub migration: Option<MigrationMarker>,
}

pub fn new_vault_id() -> String {
    let mut raw = [0u8; 16];
    getrandom::fill(&mut raw).expect("OS RNG unavailable");
    hex::encode(raw)
}

pub fn load(dir: &Path) -> Result<Option<VaultFile>, VaultError> {
    let raw = match fs::read_to_string(dir.join(VAULT_FILE)) {
        Ok(raw) => raw,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    let file: VaultFile =
        serde_json::from_str(&raw).map_err(|e| VaultError::Corrupt(e.to_string()))?;
    if file.version != FILE_VERSION {
        return Err(VaultError::Corrupt(format!(
            "unknown vault version {}",
            file.version
        )));
    }
    Ok(Some(file))
}

/// Losing this file makes an encrypted database unrecoverable, so a crash must
/// leave either the old version or the new one — never a truncated file.
pub fn save(dir: &Path, file: &VaultFile) -> Result<(), VaultError> {
    let json = serde_json::to_string_pretty(file).map_err(|e| VaultError::Io(e.to_string()))?;
    let tmp = dir.join(TMP_FILE);
    {
        let mut out = File::create(&tmp)?;
        out.write_all(json.as_bytes())?;
        out.sync_all()?;
    }
    fs::rename(&tmp, dir.join(VAULT_FILE))?;
    // The rename is only durable once the directory entry is.
    #[cfg(unix)]
    File::open(dir)?.sync_all()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> VaultFile {
        VaultFile {
            version: FILE_VERSION,
            vault_id: new_vault_id(),
            mode: VaultMode::Password,
            salt: Some("0123456789abcdef0123456789abcdef".into()),
            kdf: Some(crate::crypto::account::KdfParams::current()),
            wrapped_ldk: Some("blob".into()),
            wrapped_ldk_recovery: None,
            wrapped_ldk_by_dek: None,
            wrapped_dek_recovery: None,
            migration: None,
        }
    }

    #[test]
    fn a_missing_file_is_none() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(dir.path()).unwrap(), None);
    }

    #[test]
    fn save_then_load_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let file = sample();
        save(dir.path(), &file).unwrap();
        assert_eq!(load(dir.path()).unwrap(), Some(file));
        // No temp file is left behind by the atomic write.
        let names: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(names, vec![VAULT_FILE.to_string()]);
    }

    #[test]
    fn absent_optionals_are_omitted_on_disk() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), &sample()).unwrap();
        let raw = std::fs::read_to_string(dir.path().join(VAULT_FILE)).unwrap();
        assert!(raw.contains("\"mode\": \"password\""));
        assert!(!raw.contains("wrappedLdkByDek"));
        assert!(!raw.contains("migration"));
    }

    #[test]
    fn garbage_is_corrupt_not_a_panic() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(VAULT_FILE), "{not json").unwrap();
        assert!(matches!(load(dir.path()), Err(VaultError::Corrupt(_))));
    }

    #[test]
    fn an_unknown_version_is_corrupt() {
        let dir = tempfile::tempdir().unwrap();
        let mut file = sample();
        file.version = 99;
        save(dir.path(), &file).unwrap();
        assert!(matches!(load(dir.path()), Err(VaultError::Corrupt(_))));
    }

    #[test]
    fn vault_ids_are_32_hex_and_unique() {
        let a = new_vault_id();
        assert_eq!(a.len(), 32);
        assert!(a.bytes().all(|b| b.is_ascii_hexdigit()));
        assert_ne!(a, new_vault_id());
    }

    #[test]
    fn errors_serialize_with_a_code() {
        assert_eq!(
            serde_json::to_string(&VaultError::WrongSecret).unwrap(),
            r#"{"code":"wrong-secret"}"#
        );
        assert_eq!(
            serde_json::to_string(&VaultError::Io("disk full".into())).unwrap(),
            r#"{"code":"io","detail":"disk full"}"#
        );
    }
}
