use zeroize::Zeroizing;

use super::keys::Key;
use super::VaultError;

pub trait KeyStore: Send + Sync {
    fn get(&self, vault_id: &str) -> Result<Key, VaultError>;
    fn set(&self, vault_id: &str, key: &[u8; 32]) -> Result<(), VaultError>;
    fn delete(&self, vault_id: &str) -> Result<(), VaultError>;
}

const SERVICE: &str = "com.bunly.app";

/// Scoped by vault id, not just by app: two databases under one OS session
/// (e.g. test instances run with different HOMEs) share one keychain.
fn os_account(vault_id: &str) -> String {
    format!("local-db-key:{vault_id}")
}

pub struct OsKeyStore;

impl OsKeyStore {
    fn entry(vault_id: &str) -> Result<keyring::Entry, VaultError> {
        keyring::Entry::new(SERVICE, &os_account(vault_id))
            .map_err(|e| VaultError::KeychainDenied(e.to_string()))
    }
}

impl KeyStore for OsKeyStore {
    fn get(&self, vault_id: &str) -> Result<Key, VaultError> {
        let secret = Zeroizing::new(match Self::entry(vault_id)?.get_secret() {
            Ok(secret) => secret,
            Err(keyring::Error::NoEntry) => return Err(VaultError::KeyMissing),
            Err(e) => return Err(VaultError::KeychainDenied(e.to_string())),
        });
        let bytes: [u8; 32] = secret
            .as_slice()
            .try_into()
            .map_err(|_| VaultError::Corrupt("keychain entry is not a 32-byte key".into()))?;
        Ok(Zeroizing::new(bytes))
    }

    fn set(&self, vault_id: &str, key: &[u8; 32]) -> Result<(), VaultError> {
        Self::entry(vault_id)?
            .set_secret(key)
            .map_err(|e| VaultError::KeychainDenied(e.to_string()))
    }

    fn delete(&self, vault_id: &str) -> Result<(), VaultError> {
        match Self::entry(vault_id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(VaultError::KeychainDenied(e.to_string())),
        }
    }
}

#[cfg(test)]
pub use memory::MemoryKeyStore;

#[cfg(test)]
mod memory {
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;

    use zeroize::Zeroizing;

    use super::{Key, KeyStore, VaultError};

    #[derive(Default)]
    pub struct MemoryKeyStore {
        entries: Mutex<HashMap<String, [u8; 32]>>,
        denied: AtomicBool,
        delete_denied: AtomicBool,
    }

    impl MemoryKeyStore {
        pub fn new() -> Self {
            Self::default()
        }
        pub fn deny(&self) {
            self.denied.store(true, Ordering::SeqCst);
        }
        pub fn set_delete_denied(&self, denied: bool) {
            self.delete_denied.store(denied, Ordering::SeqCst);
        }
        pub fn is_empty(&self) -> bool {
            self.entries.lock().unwrap().is_empty()
        }
        pub fn contains(&self, vault_id: &str) -> bool {
            self.entries.lock().unwrap().contains_key(vault_id)
        }
        fn check(&self) -> Result<(), VaultError> {
            if self.denied.load(Ordering::SeqCst) {
                return Err(VaultError::KeychainDenied("denied by test".into()));
            }
            Ok(())
        }
    }

    impl KeyStore for MemoryKeyStore {
        fn get(&self, vault_id: &str) -> Result<Key, VaultError> {
            self.check()?;
            self.entries
                .lock()
                .unwrap()
                .get(vault_id)
                .map(|k| Zeroizing::new(*k))
                .ok_or(VaultError::KeyMissing)
        }
        fn set(&self, vault_id: &str, key: &[u8; 32]) -> Result<(), VaultError> {
            self.check()?;
            self.entries
                .lock()
                .unwrap()
                .insert(vault_id.to_owned(), *key);
            Ok(())
        }
        fn delete(&self, vault_id: &str) -> Result<(), VaultError> {
            self.check()?;
            if self.delete_denied.load(Ordering::SeqCst) {
                return Err(VaultError::KeychainDenied("delete denied by test".into()));
            }
            self.entries.lock().unwrap().remove(vault_id);
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_store_is_scoped_by_vault_id() {
        let store = MemoryKeyStore::new();
        store.set("a", &[1u8; 32]).unwrap();
        store.set("b", &[2u8; 32]).unwrap();
        assert_eq!(*store.get("a").unwrap(), [1u8; 32]);
        assert_eq!(*store.get("b").unwrap(), [2u8; 32]);
    }

    #[test]
    fn a_missing_entry_is_key_missing() {
        assert_eq!(
            MemoryKeyStore::new().get("nope").unwrap_err(),
            VaultError::KeyMissing
        );
    }

    #[test]
    fn deleting_a_missing_entry_is_fine() {
        MemoryKeyStore::new().delete("nope").unwrap();
    }

    #[test]
    fn a_denied_store_reports_denied() {
        let store = MemoryKeyStore::new();
        store.set("a", &[1u8; 32]).unwrap();
        store.deny();
        assert!(matches!(store.get("a"), Err(VaultError::KeychainDenied(_))));
    }

    #[test]
    fn the_os_account_name_carries_the_vault_id() {
        assert_eq!(os_account("abc"), "local-db-key:abc");
    }
}
