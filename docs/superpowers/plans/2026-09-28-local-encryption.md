# Local Database Encryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt Bunly's local SQLite database at rest with SQLCipher and gate the app behind a password (or an OS-keychain key) at startup.

**Architecture:** A random 32-byte LDK keys a SQLCipher pool opened by Rust only after a successful unlock. A plaintext `vault.json` next to the database holds the LDK's wrappings (password, recovery phrase, account DEK) and never a secret; "no password" mode keeps the LDK in the OS keychain. React renders a `VaultGate` in place of the app until Rust has registered the pool, after which the existing init path runs unchanged.

**Tech Stack:** Rust (Tauri 2, sqlx 0.8 on `libsqlite3-sys` 0.30 built with `bundled-sqlcipher-vendored-openssl`, `keyring` 3, existing `argon2`/`chacha20poly1305`/`hkdf`/`bip39`), React 19 + TypeScript, Vitest + Testing Library, pnpm, Biome.

**Spec:** `docs/superpowers/specs/2026-09-28-local-encryption-design.md`

## Global Constraints

- Package manager is **pnpm**, never npm.
- **Never run git write commands** (commit, add, stash, push…): the user manages git. Every "checkpoint" step below means: stop, run the listed checks, and move on — no commit.
- Code comments in **English**, only for a non-obvious *why*. Types live in their own file (`types.ts`), except non-shared component props.
- The LDK and the DEK **never cross IPC**. JS only ever sees wrapped/sealed base64 blobs. Recovery phrases are the one exception (shown once, never persisted, never logged, dropped after confirmation).
- Argon2id parameters and salt format are the existing ones (`crypto::derive`, 32 lowercase hex chars). Wrapping uses `crypto::wrap::{seal, open}` (XChaCha20-Poly1305, base64 `nonce‖ciphertext‖tag`).
- HKDF infos / AADs, verbatim: `usagi/local-kek/v1`, `usagi/local-dek/v1`, `usagi/local-backup/v1` (HKDF infos); `usagi/wrap/ldk/v1`, `usagi/wrap/ldk-recovery/v1`, `usagi/wrap/ldk-dek/v1`, `usagi/wrap/local-dek/v1`, `usagi/local-backup/v1` (AADs).
- Keychain entry: service `com.bunly.app`, account `local-db-key:<vaultId>`.
- File names in the app config dir: `usagi.db`, `vault.json`, `usagi.db.enc` (migration temp), `usagi.db.plain` (migration swap), `bunly-before-replace-<stamp>.bunlybak`.
- `vault.json` is always written atomically (temp file, `fsync`, `rename`, `fsync` of the directory).
- UI strings are bilingual (`src/i18n/locales/en.ts` and `fr.ts`), new keys under a `vault` section.
- End of work (CLAUDE.md): changelog entry (bilingual, `Unreleased`), `react-doctor` (`nvm use 22.22.2 && rm -rf ~/.npm/_npx` first), `pnpm run lint:fix`.

## Review Focus

1. **App killed mid-migration** (power loss between export and swap): the next launch must end with exactly one readable, encrypted `usagi.db` and no data loss — never an encrypted file sitting next to a stale `-wal` from the plaintext one. Pinned by Task 5's resume tests at every step.
2. **Two databases on one machine** (the user's test instances with different `HOME`s share one login keychain): keychain mode on one must not read or overwrite the other's key. Pinned by Task 4 (`vaultId`-scoped entries) and Task 6.
3. **A mistyped recovery phrase** (bad BIP39 checksum, extra spaces, uppercase): must report "wrong secret", never an internal error, and never unlock. Pinned in Task 6.
4. **Double unlock** (React StrictMode runs the keychain auto-unlock effect twice in dev): must not register two pools or fail the second call. Pinned in Task 7 (idempotent keychain unlock) and Task 9 (ref guard).
5. **Signing in on a device whose local password differs from the account's**: the local password must end up being the account password, the old local recovery key must still open the database, and the next launch must unlock sync without the network. Pinned in Task 6 (`bind_account`) and Task 10.

---

## File Structure

**Rust (`src-tauri/src/`)**
- `db.rs` — modify: keyed pool (`build_pool(path, ldk)`), `open_and_register(app, dir, ldk)`; drop the startup plugin.
- `vault/mod.rs` — `VaultError` (serializable to JS), module wiring.
- `vault/keys.rs` — pure key operations: LDK generation, local KEK derivation, (un)wrapping, local-DEK and backup sealing.
- `vault/file.rs` — `VaultFile` (serde), atomic load/save, `vaultId`.
- `vault/keystore.rs` — `KeyStore` trait, `OsKeyStore` (keyring), `MemoryKeyStore` (tests).
- `vault/migrate.rs` — plaintext → SQLCipher export, verification, resumable swap, legacy backup encryption.
- `vault/service.rs` — `Vault<K>`: status and every lifecycle operation, on a directory + a key store; no Tauri.
- `vault/commands.rs` — `VaultRuntime` managed state and the `vault_*` Tauri commands.
- `crypto/state.rs` — modify: keep bind material after `complete_unlock`; unlock from a local DEK.
- `crypto/account.rs` — modify: `KdfParams` also derives `Deserialize`, `PartialEq`, `Eq`.
- `lib.rs` — modify: manage `VaultRuntime`, register commands, remove `db::init()`.

**TypeScript (`src/`)**
- `vault/types.ts`, `vault/index.ts` — IPC wrappers and types.
- `components/vault/VaultGate.tsx` (+ `SetupScreen.tsx`, `UnlockScreen.tsx`, `RecoverScreen.tsx`, `VaultMessage.tsx`) — the startup gate.
- `components/vault/SecurityPanel.tsx` — the Settings › Security tab.
- `App.tsx` — modify: gate first, then the existing init; unlock sync from `local_dek`.
- `sync/auth.ts`, `sync/state.ts`, `components/sync/sync-panel-deps.ts` — modify: bind/unbind the account.
- `components/layout/AppShell.tsx`, `components/layout/SettingsDialog.tsx`, `types/settings-tab.ts` — modify: encrypted backups, import, Security tab.
- `i18n/locales/en.ts`, `fr.ts` — modify: `vault` section, `settings.tabSecurity`, `data.exportPlaintextWarning`.

---

### Task 1: SQLCipher-backed keyed pool

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/db.rs`
- Test: `src-tauri/src/db.rs` (`#[cfg(test)] mod tests`)

**Interfaces:**
- Produces: `pub async fn build_pool(path: &Path, ldk: &[u8; 32]) -> Result<SqlitePool, sqlx::Error>`; `pub fn key_pragma(ldk: &[u8; 32]) -> String`; `pub const DB_FILE: &str = "usagi.db"` (now `pub`).

- [ ] **Step 1: Add the dependency**

In `src-tauri/Cargo.toml`, under `[dependencies]`, right after the `sqlx` line:

```toml
# Swaps the SQLite that sqlx (and so tauri-plugin-sql) links for SQLCipher:
# cargo unifies features, so every crate in the tree gets the encrypted build.
# The version must stay on the one sqlx 0.8 resolves (see Cargo.lock).
libsqlite3-sys = { version = "0.30", features = ["bundled-sqlcipher-vendored-openssl"] }
```

Run: `cd src-tauri && cargo tree -i libsqlite3-sys -e features | head -20`
Expected: a single `libsqlite3-sys v0.30.x` listing both `bundled` and `bundled-sqlcipher-vendored-openssl`. If two versions appear, change `0.30` to the one sqlx uses.

- [ ] **Step 2: Write the failing tests**

Append to the `tests` module of `src-tauri/src/db.rs`:

```rust
    const KEY: [u8; 32] = [7u8; 32];

    #[tokio::test]
    async fn sqlcipher_is_the_linked_sqlite() {
        let dir = tempfile::tempdir().expect("tempdir");
        let pool = build_pool(&dir.path().join("k.db"), &KEY).await.expect("pool");
        let version: String = sqlx::query_scalar("PRAGMA cipher_version")
            .fetch_one(&pool)
            .await
            .expect("stock SQLite has no cipher_version pragma");
        assert!(!version.is_empty());
    }

    #[tokio::test]
    async fn the_file_on_disk_is_not_plain_sqlite() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("k.db");
        let pool = build_pool(&path, &KEY).await.expect("pool");
        sqlx::query("CREATE TABLE t (id TEXT PRIMARY KEY)").execute(&pool).await.expect("create");
        sqlx::query("INSERT INTO t (id) VALUES ('secret-title')").execute(&pool).await.expect("insert");
        pool.close().await;

        let bytes = std::fs::read(&path).expect("read");
        assert_ne!(&bytes[..16], b"SQLite format 3\0");
        assert!(!bytes.windows(12).any(|w| w == b"secret-title"));
    }

    #[tokio::test]
    async fn a_wrong_key_cannot_read_it() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("k.db");
        let pool = build_pool(&path, &KEY).await.expect("pool");
        sqlx::query("CREATE TABLE t (id TEXT PRIMARY KEY)").execute(&pool).await.expect("create");
        pool.close().await;

        // Depending on the pragmas sqlx runs at connect, the failure surfaces
        // either while connecting or on the first read; both are a refusal.
        let refused = match build_pool(&path, &[8u8; 32]).await {
            Err(_) => true,
            Ok(other) => sqlx::query("SELECT COUNT(*) FROM t").fetch_one(&other).await.is_err(),
        };
        assert!(refused);
    }

    #[tokio::test]
    async fn the_right_key_reopens_it() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("k.db");
        let pool = build_pool(&path, &KEY).await.expect("pool");
        sqlx::query("CREATE TABLE t (id TEXT PRIMARY KEY)").execute(&pool).await.expect("create");
        sqlx::query("INSERT INTO t (id) VALUES ('a')").execute(&pool).await.expect("insert");
        pool.close().await;

        let again = build_pool(&path, &KEY).await.expect("reopen");
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM t").fetch_one(&again).await.expect("count");
        assert_eq!(n, 1);
    }
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test db::tests -- --nocapture`
Expected: compile error, `build_pool` takes 1 argument.

- [ ] **Step 4: Implement the keyed pool**

In `src-tauri/src/db.rs`, make `DB_FILE` public and replace `build_pool`:

```rust
pub const DB_FILE: &str = "usagi.db";

/// SQLCipher raw-key syntax: the 64 hex chars are used as the key itself, so
/// SQLCipher skips its own PBKDF2 — Argon2id already stretched the password
/// that protects this key (src-tauri/src/vault/keys.rs).
pub fn key_pragma(ldk: &[u8; 32]) -> String {
    format!("\"x'{}'\"", hex::encode(ldk))
}

pub async fn build_pool(path: &Path, ldk: &[u8; 32]) -> Result<SqlitePool, sqlx::Error> {
    // sqlx runs `key` before any other pragma (it reserves the slot in
    // SqliteConnectOptions::new); SQLCipher refuses every statement until then.
    let options = SqliteConnectOptions::new()
        .filename(path)
        .pragma("key", key_pragma(ldk))
        .create_if_missing(true);

    SqlitePoolOptions::new()
        // The whole point of this module — see the module docs.
        .max_connections(1)
        // Keep that one connection alive for the process's lifetime. A reaped
        // connection is replaced by a fresh one, and doing that between a
        // `BEGIN` and its `COMMIT` would discard the open transaction without
        // an error reaching the caller.
        .idle_timeout(None)
        .max_lifetime(None)
        .connect_with(options)
        .await
}
```

Update the existing `register` function temporarily so the crate compiles (Task 7 replaces it): change `build_pool(&path)` to `build_pool(&path, &[0u8; 32])`. This intermediate state is never run.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test db::tests`
Expected: 5 passed (the 4 new ones + `a_multi_connection_pool_loses_the_transaction`). The first build compiles OpenSSL and SQLCipher and takes several minutes.

- [ ] **Step 6: Checkpoint** — `cargo test` in `src-tauri` is green. No commit.

---

### Task 2: Key operations (`vault/keys.rs`)

**Files:**
- Create: `src-tauri/src/vault/mod.rs`
- Create: `src-tauri/src/vault/keys.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod vault;` next to `pub mod db;`)

**Interfaces:**
- Consumes: `crypto::derive::{derive_master_key, generate_auth_salt}`, `crypto::recovery::recovery_kek_from_phrase`, `crypto::wrap::{seal, open, AAD_DEK_RECOVERY}`, `crypto::CryptoError`.
- Produces (all in `crate::vault::keys`):
  - `pub type Key = zeroize::Zeroizing<[u8; 32]>;`
  - `pub const AAD_LDK, AAD_LDK_RECOVERY, AAD_LDK_DEK, AAD_LOCAL_DEK, AAD_LOCAL_BACKUP: &[u8]`
  - `pub fn generate_ldk() -> Key`
  - `pub fn local_kek_from_master(master_key: &[u8; 32]) -> Key`
  - `pub fn local_kek_from_password(password: &str, salt: &str) -> Result<Key, CryptoError>`
  - `pub fn recovery_kek(phrase: &str) -> Result<Key, CryptoError>`
  - `pub fn wrap_key(kek: &[u8; 32], aad: &[u8], key: &[u8; 32]) -> String`
  - `pub fn unwrap_key(kek: &[u8; 32], aad: &[u8], blob: &str) -> Result<Key, CryptoError>`
  - `pub fn seal_local_dek(ldk: &[u8; 32], dek: &[u8; 32]) -> String` / `pub fn open_local_dek(ldk: &[u8; 32], blob: &str) -> Result<Key, CryptoError>`
  - `pub fn seal_backup(ldk: &[u8; 32], plaintext: &[u8]) -> String` / `pub fn open_backup(ldk: &[u8; 32], blob: &str) -> Result<Vec<u8>, CryptoError>`

- [ ] **Step 1: Create the module skeleton**

`src-tauri/src/vault/mod.rs`:

```rust
//! Local database encryption. See docs/superpowers/specs/2026-09-28-local-encryption-design.md.

pub mod keys;
```

In `src-tauri/src/lib.rs`, add `pub mod vault;` below `pub mod db;`.

- [ ] **Step 2: Write the failing tests**

`src-tauri/src/vault/keys.rs` (tests first, the functions come in Step 4):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::derive::{derive_master_key, generate_auth_salt};
    use crate::crypto::recovery::generate_recovery_phrase;

    const SALT: &str = "0123456789abcdef0123456789abcdef";

    #[test]
    fn two_ldks_differ() {
        assert_ne!(*generate_ldk(), *generate_ldk());
    }

    #[test]
    fn the_password_path_round_trips() {
        let ldk = generate_ldk();
        let kek = local_kek_from_password("pw", SALT).unwrap();
        let blob = wrap_key(&kek, AAD_LDK, &ldk);
        assert_eq!(*unwrap_key(&kek, AAD_LDK, &blob).unwrap(), *ldk);
    }

    #[test]
    fn a_wrong_password_does_not_unwrap() {
        let ldk = generate_ldk();
        let blob = wrap_key(&local_kek_from_password("pw", SALT).unwrap(), AAD_LDK, &ldk);
        let wrong = local_kek_from_password("pX", SALT).unwrap();
        assert_eq!(unwrap_key(&wrong, AAD_LDK, &blob).unwrap_err(), CryptoError::Decrypt);
    }

    #[test]
    fn the_local_kek_is_not_the_account_kek() {
        // Same master key, different HKDF domain: a database key must never
        // equal the key that wraps the account DEK.
        let master = derive_master_key("pw", SALT).unwrap();
        assert_ne!(*local_kek_from_master(&master), crate::crypto::derive::derive_kek(&master));
    }

    #[test]
    fn from_password_equals_from_master() {
        let master = derive_master_key("pw", SALT).unwrap();
        assert_eq!(*local_kek_from_password("pw", SALT).unwrap(), *local_kek_from_master(&master));
    }

    #[test]
    fn an_aad_mismatch_is_refused() {
        let ldk = generate_ldk();
        let kek = local_kek_from_password("pw", &generate_auth_salt()).unwrap();
        let blob = wrap_key(&kek, AAD_LDK, &ldk);
        assert!(unwrap_key(&kek, AAD_LDK_RECOVERY, &blob).is_err());
    }

    #[test]
    fn the_recovery_path_round_trips_despite_sloppy_typing() {
        let ldk = generate_ldk();
        let phrase = generate_recovery_phrase();
        let blob = wrap_key(&recovery_kek(&phrase).unwrap(), AAD_LDK_RECOVERY, &ldk);
        let retyped = format!("  {}  ", phrase.to_uppercase().replace(' ', "   "));
        let rk = recovery_kek(&retyped).unwrap();
        assert_eq!(*unwrap_key(&rk, AAD_LDK_RECOVERY, &blob).unwrap(), *ldk);
    }

    #[test]
    fn the_local_dek_round_trips_and_is_bound_to_the_ldk() {
        let ldk = generate_ldk();
        let dek = [9u8; 32];
        let blob = seal_local_dek(&ldk, &dek);
        assert_eq!(*open_local_dek(&ldk, &blob).unwrap(), dek);
        assert!(open_local_dek(&generate_ldk(), &blob).is_err());
    }

    #[test]
    fn a_backup_round_trips_and_is_bound_to_the_ldk() {
        let ldk = generate_ldk();
        let blob = seal_backup(&ldk, b"{\"version\":1}");
        assert_eq!(open_backup(&ldk, &blob).unwrap(), b"{\"version\":1}");
        assert!(open_backup(&generate_ldk(), &blob).is_err());
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test vault::keys`
Expected: compile errors, `generate_ldk` etc. not found.

- [ ] **Step 4: Implement**

Top of `src-tauri/src/vault/keys.rs`:

```rust
use hkdf::Hkdf;
use sha2::Sha256;
use zeroize::{Zeroize, Zeroizing};

use crate::crypto::derive::derive_master_key;
use crate::crypto::recovery::recovery_kek_from_phrase;
use crate::crypto::wrap::{open, seal};
use crate::crypto::CryptoError;

pub type Key = Zeroizing<[u8; 32]>;

pub const AAD_LDK: &[u8] = b"usagi/wrap/ldk/v1";
pub const AAD_LDK_RECOVERY: &[u8] = b"usagi/wrap/ldk-recovery/v1";
pub const AAD_LDK_DEK: &[u8] = b"usagi/wrap/ldk-dek/v1";
pub const AAD_LOCAL_DEK: &[u8] = b"usagi/wrap/local-dek/v1";
pub const AAD_LOCAL_BACKUP: &[u8] = b"usagi/local-backup/v1";

const INFO_LOCAL_KEK: &[u8] = b"usagi/local-kek/v1";
const INFO_LOCAL_DEK: &[u8] = b"usagi/local-dek/v1";
const INFO_LOCAL_BACKUP: &[u8] = b"usagi/local-backup/v1";

fn hkdf32(ikm: &[u8; 32], info: &[u8]) -> Key {
    let hk = Hkdf::<Sha256>::new(None, ikm);
    let mut out = Zeroizing::new([0u8; 32]);
    hk.expand(info, out.as_mut())
        .expect("32 bytes is a valid HKDF length");
    out
}

pub fn generate_ldk() -> Key {
    let mut key = Zeroizing::new([0u8; 32]);
    getrandom::fill(key.as_mut()).expect("OS RNG unavailable");
    key
}

pub fn local_kek_from_master(master_key: &[u8; 32]) -> Key {
    hkdf32(master_key, INFO_LOCAL_KEK)
}

pub fn local_kek_from_password(password: &str, salt: &str) -> Result<Key, CryptoError> {
    let mut master = derive_master_key(password, salt)?;
    let kek = local_kek_from_master(&master);
    master.zeroize();
    Ok(kek)
}

pub fn recovery_kek(phrase: &str) -> Result<Key, CryptoError> {
    Ok(Zeroizing::new(recovery_kek_from_phrase(phrase)?))
}

pub fn wrap_key(kek: &[u8; 32], aad: &[u8], key: &[u8; 32]) -> String {
    seal(kek, aad, key)
}

pub fn unwrap_key(kek: &[u8; 32], aad: &[u8], blob: &str) -> Result<Key, CryptoError> {
    let opened = Zeroizing::new(open(kek, aad, blob)?);
    let bytes: [u8; 32] = opened
        .as_slice()
        .try_into()
        .map_err(|_| CryptoError::Input("wrapped key did not hold 32 bytes".into()))?;
    Ok(Zeroizing::new(bytes))
}

pub fn seal_local_dek(ldk: &[u8; 32], dek: &[u8; 32]) -> String {
    seal(&hkdf32(ldk, INFO_LOCAL_DEK), AAD_LOCAL_DEK, dek)
}

pub fn open_local_dek(ldk: &[u8; 32], blob: &str) -> Result<Key, CryptoError> {
    unwrap_key(&hkdf32(ldk, INFO_LOCAL_DEK), AAD_LOCAL_DEK, blob)
}

pub fn seal_backup(ldk: &[u8; 32], plaintext: &[u8]) -> String {
    seal(&hkdf32(ldk, INFO_LOCAL_BACKUP), AAD_LOCAL_BACKUP, plaintext)
}

pub fn open_backup(ldk: &[u8; 32], blob: &str) -> Result<Vec<u8>, CryptoError> {
    open(&hkdf32(ldk, INFO_LOCAL_BACKUP), AAD_LOCAL_BACKUP, blob)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test vault::keys`
Expected: 9 passed.

- [ ] **Step 6: Checkpoint** — no commit.

---

### Task 3: `vault.json` and errors (`vault/file.rs`, `vault/mod.rs`)

**Files:**
- Modify: `src-tauri/src/vault/mod.rs`
- Create: `src-tauri/src/vault/file.rs`
- Modify: `src-tauri/src/crypto/account.rs` (derive `Deserialize, PartialEq, Eq` on `KdfParams`)

**Interfaces:**
- Produces:
  - `crate::vault::VaultError` — `#[serde(tag = "code", content = "detail", rename_all = "kebab-case")]` enum: `WrongSecret`, `KeychainDenied(String)`, `KeyMissing`, `Corrupt(String)`, `MigrationFailed(String)`, `Io(String)`, `InvalidState(String)`. `impl From<std::io::Error>` → `Io`.
  - `crate::vault::file::{VaultFile, VaultMode, MigrationMarker, VAULT_FILE, FILE_VERSION, new_vault_id, load, save}` with `pub fn load(dir: &Path) -> Result<Option<VaultFile>, VaultError>` and `pub fn save(dir: &Path, file: &VaultFile) -> Result<(), VaultError>`.

- [ ] **Step 1: Write the failing tests**

`src-tauri/src/vault/file.rs`:

```rust
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
        let names: Vec<_> = std::fs::read_dir(dir.path()).unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap()).collect();
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
        assert_eq!(serde_json::to_string(&VaultError::WrongSecret).unwrap(), r#"{"code":"wrong-secret"}"#);
        assert_eq!(
            serde_json::to_string(&VaultError::Io("disk full".into())).unwrap(),
            r#"{"code":"io","detail":"disk full"}"#
        );
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test vault::file`
Expected: compile errors (module `file` not declared / types missing).

- [ ] **Step 3: Implement `VaultError`**

Replace `src-tauri/src/vault/mod.rs`:

```rust
//! Local database encryption. See docs/superpowers/specs/2026-09-28-local-encryption-design.md.

pub mod file;
pub mod keys;

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
```

`Locked` maps to `WrongSecret` only as a total match; no vault path produces it.

- [ ] **Step 4: Make `KdfParams` deserializable**

In `src-tauri/src/crypto/account.rs`, change the derive on `KdfParams` to:

```rust
#[derive(Serialize, serde::Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
```

- [ ] **Step 5: Implement `file.rs`**

Top of `src-tauri/src/vault/file.rs`:

```rust
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
        return Err(VaultError::Corrupt(format!("unknown vault version {}", file.version)));
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test vault::`
Expected: all `vault::file` and `vault::keys` tests pass.

- [ ] **Step 7: Checkpoint** — no commit.

---

### Task 4: Key store (`vault/keystore.rs`)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/vault/mod.rs` (add `pub mod keystore;`)
- Create: `src-tauri/src/vault/keystore.rs`

**Interfaces:**
- Produces:
  - `pub trait KeyStore: Send + Sync { fn get(&self, vault_id: &str) -> Result<Key, VaultError>; fn set(&self, vault_id: &str, key: &[u8; 32]) -> Result<(), VaultError>; fn delete(&self, vault_id: &str) -> Result<(), VaultError>; }`
  - `pub struct OsKeyStore;` (implements `KeyStore`)
  - `#[cfg(test)] pub struct MemoryKeyStore` with `pub fn new() -> Self`, `pub fn deny(&self)`, `pub fn contains(&self, vault_id: &str) -> bool`.

- [ ] **Step 1: Add the dependency**

In `src-tauri/Cargo.toml` `[dependencies]`:

```toml
# The "no password" mode keeps the database key in the OS credential store
# (Keychain / Credential Manager / Secret Service), never in a file.
keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service"] }
```

Run: `cd src-tauri && cargo check`
Expected: compiles. If the feature names were renamed in the resolved `keyring` 3.x, run `cargo add keyring@3 --features apple-native,windows-native,sync-secret-service` and use what it accepts.

- [ ] **Step 2: Write the failing tests**

`src-tauri/src/vault/keystore.rs`:

```rust
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
        assert_eq!(MemoryKeyStore::new().get("nope").unwrap_err(), VaultError::KeyMissing);
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test vault::keystore`
Expected: compile errors.

- [ ] **Step 4: Implement**

Top of `src-tauri/src/vault/keystore.rs`:

```rust
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
    }

    impl MemoryKeyStore {
        pub fn new() -> Self {
            Self::default()
        }
        pub fn deny(&self) {
            self.denied.store(true, Ordering::SeqCst);
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
            self.entries.lock().unwrap().get(vault_id).map(|k| Zeroizing::new(*k)).ok_or(VaultError::KeyMissing)
        }
        fn set(&self, vault_id: &str, key: &[u8; 32]) -> Result<(), VaultError> {
            self.check()?;
            self.entries.lock().unwrap().insert(vault_id.to_owned(), *key);
            Ok(())
        }
        fn delete(&self, vault_id: &str) -> Result<(), VaultError> {
            self.check()?;
            self.entries.lock().unwrap().remove(vault_id);
            Ok(())
        }
    }
}
```

Add `pub mod keystore;` to `vault/mod.rs`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test vault::keystore`
Expected: 5 passed.

- [ ] **Step 6: Checkpoint** — no commit.

---

### Task 5: Plaintext → SQLCipher migration (`vault/migrate.rs`)

**Files:**
- Modify: `src-tauri/src/vault/mod.rs` (add `pub mod migrate;`)
- Create: `src-tauri/src/vault/migrate.rs`

**Interfaces:**
- Consumes: `crate::db::{build_pool, key_pragma, DB_FILE}`, `super::keys::seal_backup`.
- Produces:
  - `pub const ENC_FILE: &str = "usagi.db.enc"; pub const PLAIN_FILE: &str = "usagi.db.plain";`
  - `pub fn is_plaintext_sqlite(path: &Path) -> std::io::Result<bool>`
  - `pub async fn migrate(dir: &Path, ldk: &[u8; 32]) -> Result<(), VaultError>` (resumable, idempotent)
  - `pub fn encrypt_legacy_backups(dir: &Path, ldk: &[u8; 32]) -> Result<(), VaultError>`

- [ ] **Step 1: Write the failing tests**

`src-tauri/src/vault/migrate.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use sqlx::SqlitePool;

    const LDK: [u8; 32] = [5u8; 32];

    async fn plain_pool(path: &Path) -> SqlitePool {
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(SqliteConnectOptions::new().filename(path).create_if_missing(true)
                .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal))
            .await
            .unwrap()
    }

    /// A plaintext usagi.db with two tables, a user_version, and rows still
    /// sitting in the WAL (never checkpointed) — the realistic starting point.
    async fn seed_plain(dir: &Path) {
        let pool = plain_pool(&dir.join(DB_FILE)).await;
        for sql in [
            "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT)",
            "CREATE TABLE tags (id TEXT PRIMARY KEY)",
            "INSERT INTO tasks VALUES ('1', 'secret-title'), ('2', 'b')",
            "INSERT INTO tags VALUES ('t')",
            "PRAGMA user_version = 10",
        ] {
            sqlx::query(sql).execute(&pool).await.unwrap();
        }
        pool.close().await;
    }

    async fn count(pool: &SqlitePool, table: &str) -> i64 {
        sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}")).fetch_one(pool).await.unwrap()
    }

    async fn assert_migrated(dir: &Path) {
        let db = dir.join(DB_FILE);
        assert!(!is_plaintext_sqlite(&db).unwrap());
        for leftover in [ENC_FILE, PLAIN_FILE, "usagi.db.plain-wal", "usagi.db-wal"] {
            assert!(!dir.join(leftover).exists(), "{leftover} left behind");
        }
        let pool = build_pool(&db, &LDK).await.unwrap();
        assert_eq!(count(&pool, "tasks").await, 2);
        assert_eq!(count(&pool, "tags").await, 1);
        let v: i64 = sqlx::query_scalar("PRAGMA user_version").fetch_one(&pool).await.unwrap();
        assert_eq!(v, 10);
    }

    #[tokio::test]
    async fn detects_plaintext() {
        let dir = tempfile::tempdir().unwrap();
        seed_plain(dir.path()).await;
        assert!(is_plaintext_sqlite(&dir.path().join(DB_FILE)).unwrap());
    }

    #[tokio::test]
    async fn migrates_a_plaintext_database() {
        let dir = tempfile::tempdir().unwrap();
        seed_plain(dir.path()).await;
        migrate(dir.path(), &LDK).await.unwrap();
        assert_migrated(dir.path()).await;
        let bytes = std::fs::read(dir.path().join(DB_FILE)).unwrap();
        assert!(!bytes.windows(12).any(|w| w == b"secret-title"));
    }

    #[tokio::test]
    async fn running_it_twice_is_harmless() {
        let dir = tempfile::tempdir().unwrap();
        seed_plain(dir.path()).await;
        migrate(dir.path(), &LDK).await.unwrap();
        migrate(dir.path(), &LDK).await.unwrap();
        assert_migrated(dir.path()).await;
    }

    #[tokio::test]
    async fn resumes_after_a_crash_mid_export() {
        let dir = tempfile::tempdir().unwrap();
        seed_plain(dir.path()).await;
        // A partial export: garbage where the encrypted copy was being written.
        std::fs::write(dir.path().join(ENC_FILE), b"half-written").unwrap();
        migrate(dir.path(), &LDK).await.unwrap();
        assert_migrated(dir.path()).await;
    }

    #[tokio::test]
    async fn resumes_after_a_crash_between_the_two_renames() {
        let dir = tempfile::tempdir().unwrap();
        seed_plain(dir.path()).await;
        migrate(dir.path(), &LDK).await.unwrap();
        // Rebuild the state "usagi.db → .plain done, .enc → usagi.db not done".
        let d = dir.path();
        std::fs::rename(d.join(DB_FILE), d.join(ENC_FILE)).unwrap();
        std::fs::write(d.join(PLAIN_FILE), b"stale plaintext").unwrap();
        migrate(d, &LDK).await.unwrap();
        assert_migrated(d).await;
    }

    #[tokio::test]
    async fn resumes_after_a_crash_before_deleting_the_plaintext() {
        let dir = tempfile::tempdir().unwrap();
        seed_plain(dir.path()).await;
        migrate(dir.path(), &LDK).await.unwrap();
        std::fs::write(dir.path().join(PLAIN_FILE), b"stale plaintext").unwrap();
        migrate(dir.path(), &LDK).await.unwrap();
        assert_migrated(dir.path()).await;
    }

    #[tokio::test]
    async fn a_failed_verification_leaves_the_plaintext_untouched() {
        let dir = tempfile::tempdir().unwrap();
        seed_plain(dir.path()).await;
        // Force verification to fail by exporting under one key and verifying
        // under another.
        export_encrypted(&dir.path().join(DB_FILE), &dir.path().join(ENC_FILE), &LDK).await.unwrap();
        let err = verify(&dir.path().join(DB_FILE), &dir.path().join(ENC_FILE), &[6u8; 32]).await.unwrap_err();
        assert!(matches!(err, VaultError::MigrationFailed(_)));
        assert!(is_plaintext_sqlite(&dir.path().join(DB_FILE)).unwrap());
        let pool = plain_pool(&dir.path().join(DB_FILE)).await;
        assert_eq!(count(&pool, "tasks").await, 2);
    }

    #[test]
    fn legacy_backups_are_encrypted_and_the_plaintext_removed() {
        let dir = tempfile::tempdir().unwrap();
        let json = dir.path().join("bunly-before-replace-2026-09-01T10-00-00.json");
        std::fs::write(&json, br#"{"version":1,"tasks":[]}"#).unwrap();
        std::fs::write(dir.path().join("unrelated.json"), b"{}").unwrap();

        encrypt_legacy_backups(dir.path(), &LDK).unwrap();

        assert!(!json.exists());
        let sealed = dir.path().join("bunly-before-replace-2026-09-01T10-00-00.bunlybak");
        let blob = std::fs::read_to_string(&sealed).unwrap();
        assert_eq!(super::super::keys::open_backup(&LDK, &blob).unwrap(), br#"{"version":1,"tasks":[]}"#);
        assert!(dir.path().join("unrelated.json").exists());
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test vault::migrate`
Expected: compile errors.

- [ ] **Step 3: Implement**

Top of `src-tauri/src/vault/migrate.rs`:

```rust
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};

use super::keys::seal_backup;
use super::VaultError;
use crate::db::{build_pool, key_pragma, DB_FILE};

pub const ENC_FILE: &str = "usagi.db.enc";
pub const PLAIN_FILE: &str = "usagi.db.plain";
const BACKUP_PREFIX: &str = "bunly-before-replace-";

fn failed(e: impl std::fmt::Display) -> VaultError {
    VaultError::MigrationFailed(e.to_string())
}

fn sidecars(path: &Path) -> [PathBuf; 2] {
    let s = path.as_os_str().to_string_lossy();
    [PathBuf::from(format!("{s}-wal")), PathBuf::from(format!("{s}-shm"))]
}

fn remove_with_sidecars(path: &Path) -> Result<(), VaultError> {
    for p in std::iter::once(path.to_path_buf()).chain(sidecars(path)) {
        match fs::remove_file(&p) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(())
}

pub fn is_plaintext_sqlite(path: &Path) -> std::io::Result<bool> {
    let mut head = [0u8; 16];
    let mut file = fs::File::open(path)?;
    let n = file.read(&mut head)?;
    Ok(n == 16 && &head == b"SQLite format 3\0")
}

async fn plain_pool(path: &Path) -> Result<SqlitePool, VaultError> {
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(SqliteConnectOptions::new().filename(path).create_if_missing(false))
        .await
        .map_err(failed)
}

/// `sqlcipher_export` is SQLCipher's own plaintext → encrypted path: it
/// recreates the schema and copies every row inside the engine, so no type is
/// lost to a round trip through JS.
async fn export_encrypted(plain: &Path, enc: &Path, ldk: &[u8; 32]) -> Result<(), VaultError> {
    remove_with_sidecars(enc)?;
    let pool = plain_pool(plain).await?;
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").execute(&pool).await.map_err(failed)?;
    let version: i64 = sqlx::query_scalar("PRAGMA user_version").fetch_one(&pool).await.map_err(failed)?;
    let enc_path = enc.to_string_lossy().replace('\'', "''");
    sqlx::query(&format!("ATTACH DATABASE '{enc_path}' AS enc KEY {}", key_pragma(ldk)))
        .execute(&pool).await.map_err(failed)?;
    sqlx::query("SELECT sqlcipher_export('enc')").execute(&pool).await.map_err(failed)?;
    sqlx::query(&format!("PRAGMA enc.user_version = {version}")).execute(&pool).await.map_err(failed)?;
    sqlx::query("DETACH DATABASE enc").execute(&pool).await.map_err(failed)?;
    pool.close().await;
    Ok(())
}

async fn table_counts(pool: &SqlitePool) -> Result<Vec<(String, i64)>, VaultError> {
    let names: Vec<String> = sqlx::query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .fetch_all(pool).await.map_err(failed)?
    .iter().map(|r| r.get::<String, _>("name")).collect();
    let mut out = Vec::with_capacity(names.len());
    for name in names {
        let n: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM \"{}\"", name.replace('"', "\"\"")))
            .fetch_one(pool).await.map_err(failed)?;
        out.push((name, n));
    }
    Ok(out)
}

async fn verify(plain: &Path, enc: &Path, ldk: &[u8; 32]) -> Result<(), VaultError> {
    let encrypted = build_pool(enc, ldk).await.map_err(failed)?;
    let check: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&encrypted).await.map_err(failed)?;
    if check != "ok" {
        return Err(failed(format!("integrity_check: {check}")));
    }
    let source = plain_pool(plain).await?;
    let (a, b) = (table_counts(&source).await?, table_counts(&encrypted).await?);
    source.close().await;
    encrypted.close().await;
    if a != b {
        return Err(failed("row counts differ after export"));
    }
    Ok(())
}

/// Every step is idempotent and the files on disk say which step was reached,
/// so a process killed anywhere in here finishes the job on the next launch.
pub async fn migrate(dir: &Path, ldk: &[u8; 32]) -> Result<(), VaultError> {
    let db = dir.join(DB_FILE);
    let enc = dir.join(ENC_FILE);
    let plain = dir.join(PLAIN_FILE);

    if plain.exists() {
        // The swap had started: the encrypted copy was verified before it.
        if !db.exists() && enc.exists() {
            fs::rename(&enc, &db)?;
        }
        return remove_with_sidecars(&plain);
    }
    if !db.exists() || !is_plaintext_sqlite(&db)? {
        // Already migrated (or nothing to migrate): drop any stray export.
        return remove_with_sidecars(&enc);
    }

    export_encrypted(&db, &enc, ldk).await?;
    if let Err(e) = verify(&db, &enc, ldk).await {
        remove_with_sidecars(&enc)?;
        return Err(e);
    }
    // The plaintext -wal/-shm are empty after the checkpoint, but left in place
    // they would be picked up as the journal of the encrypted file renamed over
    // usagi.db.
    for sidecar in sidecars(&db) {
        let _ = fs::remove_file(sidecar);
    }
    fs::rename(&db, &plain)?;
    fs::rename(&enc, &db)?;
    remove_with_sidecars(&plain)
}

pub fn encrypt_legacy_backups(dir: &Path, ldk: &[u8; 32]) -> Result<(), VaultError> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
        if !(name.starts_with(BACKUP_PREFIX) && name.ends_with(".json")) {
            continue;
        }
        let sealed = seal_backup(ldk, &fs::read(&path)?);
        let target = path.with_extension("bunlybak");
        fs::write(&target, sealed)?;
        fs::remove_file(&path)?;
    }
    Ok(())
}
```

Note: `export_encrypted` and `verify` are private `async fn`s; the tests in the same file reach them through `super::*`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test vault::migrate`
Expected: 8 passed.

- [ ] **Step 5: Checkpoint** — no commit.

---

### Task 6: Vault service (`vault/service.rs`)

**Files:**
- Modify: `src-tauri/src/vault/mod.rs` (add `pub mod service;`)
- Create: `src-tauri/src/vault/service.rs`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces (`crate::vault::service`):
  - `#[derive(Serialize, Debug, PartialEq, Eq)] #[serde(rename_all = "camelCase")] pub struct VaultStatusReport { pub state: &'static str, pub migrating: bool, pub sync_bound: bool, pub broken_reason: Option<&'static str> }` — `state` ∈ `"fresh" | "legacy-plaintext" | "keychain" | "password" | "broken"`, `broken_reason` ∈ `"corrupt" | "vault-missing"`.
  - `pub struct Vault<K: KeyStore> { dir: PathBuf, keys: K }` with:
    - `pub fn new(dir: PathBuf, keys: K) -> Self`, `pub fn dir(&self) -> &Path`
    - `pub fn status(&self) -> VaultStatusReport`
    - `pub async fn setup_keychain(&self) -> Result<Key, VaultError>`
    - `pub async fn setup_password(&self, password: &str) -> Result<(Key, String), VaultError>` (LDK, recovery phrase)
    - `pub async fn unlock_keychain(&self) -> Result<Key, VaultError>`
    - `pub async fn unlock_password(&self, password: &str) -> Result<Key, VaultError>`
    - `pub async fn unlock_recovery(&self, phrase: &str, new_password: &str) -> Result<Key, VaultError>`
    - `pub fn set_password(&self, ldk: &[u8; 32], password: &str) -> Result<String, VaultError>` (recovery phrase)
    - `pub fn change_password(&self, current: &str, new_password: &str) -> Result<(), VaultError>`
    - `pub fn remove_password(&self, current: &str) -> Result<(), VaultError>`
    - `pub fn bind_account(&self, ldk: &[u8; 32], local_kek: &[u8; 32], salt: &str, dek: &[u8; 32], wrapped_dek_recovery: &str) -> Result<String, VaultError>` (sealed `local_dek`)
    - `pub fn unbind_account(&self) -> Result<(), VaultError>`

- [ ] **Step 1: Write the failing tests**

`src-tauri/src/vault/service.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::account::prepare_registration;
    use crate::crypto::derive::derive_master_key;
    use crate::crypto::wrap::open as open_blob;
    use crate::crypto::wrap::AAD_DEK;
    use crate::vault::keystore::MemoryKeyStore;
    use crate::vault::keys::{local_kek_from_master, open_local_dek};

    fn vault() -> (tempfile::TempDir, Vault<MemoryKeyStore>) {
        let dir = tempfile::tempdir().unwrap();
        let v = Vault::new(dir.path().to_path_buf(), MemoryKeyStore::new());
        (dir, v)
    }

    fn file(v: &Vault<MemoryKeyStore>) -> VaultFile {
        load(v.dir()).unwrap().unwrap()
    }

    /// The DEK and the bind material a real sign-in would produce.
    fn account(password: &str) -> ([u8; 32], Key, String, String, String) {
        let m = prepare_registration(password).unwrap();
        let master = derive_master_key(password, &m.auth_salt).unwrap();
        let kek = crate::crypto::derive::derive_kek(&master);
        let dek: [u8; 32] = open_blob(&kek, AAD_DEK, &m.wrapped_dek).unwrap().try_into().unwrap();
        (dek, local_kek_from_master(&master), m.auth_salt, m.wrapped_dek_recovery, m.recovery_phrase)
    }

    #[test]
    fn an_empty_dir_is_fresh() {
        let (_d, v) = vault();
        assert_eq!(v.status().state, "fresh");
    }

    #[tokio::test]
    async fn keychain_setup_then_unlock_returns_the_same_ldk() {
        let (_d, v) = vault();
        let ldk = v.setup_keychain().await.unwrap();
        let s = v.status();
        assert_eq!((s.state, s.migrating, s.sync_bound), ("keychain", false, false));
        assert_eq!(*v.unlock_keychain().await.unwrap(), *ldk);
    }

    #[tokio::test]
    async fn two_vaults_sharing_a_keychain_do_not_collide() {
        let store = std::sync::Arc::new(MemoryKeyStore::new());
        struct Shared(std::sync::Arc<MemoryKeyStore>);
        impl KeyStore for Shared {
            fn get(&self, id: &str) -> Result<Key, VaultError> { self.0.get(id) }
            fn set(&self, id: &str, k: &[u8; 32]) -> Result<(), VaultError> { self.0.set(id, k) }
            fn delete(&self, id: &str) -> Result<(), VaultError> { self.0.delete(id) }
        }
        let (d1, d2) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let a = Vault::new(d1.path().to_path_buf(), Shared(store.clone()));
        let b = Vault::new(d2.path().to_path_buf(), Shared(store.clone()));
        let ka = a.setup_keychain().await.unwrap();
        let kb = b.setup_keychain().await.unwrap();
        assert_eq!(*a.unlock_keychain().await.unwrap(), *ka);
        assert_eq!(*b.unlock_keychain().await.unwrap(), *kb);
    }

    #[tokio::test]
    async fn a_lost_keychain_entry_is_key_missing() {
        let (_d, v) = vault();
        v.setup_keychain().await.unwrap();
        v.keys.delete(&file(&v).vault_id).unwrap();
        assert_eq!(v.unlock_keychain().await.unwrap_err(), VaultError::KeyMissing);
    }

    #[tokio::test]
    async fn password_setup_then_unlock() {
        let (_d, v) = vault();
        let (ldk, phrase) = v.setup_password("pw").await.unwrap();
        assert_eq!(phrase.split_whitespace().count(), 24);
        assert_eq!(v.status().state, "password");
        assert_eq!(*v.unlock_password("pw").await.unwrap(), *ldk);
        assert_eq!(v.unlock_password("nope").await.unwrap_err(), VaultError::WrongSecret);
    }

    #[tokio::test]
    async fn the_local_recovery_phrase_unlocks_and_sets_a_new_password() {
        let (_d, v) = vault();
        let (ldk, phrase) = v.setup_password("old").await.unwrap();
        assert_eq!(*v.unlock_recovery(&phrase, "new").await.unwrap(), *ldk);
        assert_eq!(*v.unlock_password("new").await.unwrap(), *ldk);
        assert_eq!(v.unlock_password("old").await.unwrap_err(), VaultError::WrongSecret);
        // The recovery phrase keeps working after being used.
        assert_eq!(*v.unlock_recovery(&phrase, "newer").await.unwrap(), *ldk);
    }

    #[tokio::test]
    async fn a_mistyped_phrase_is_a_wrong_secret() {
        let (_d, v) = vault();
        v.setup_password("pw").await.unwrap();
        let (_, _, _, _, other) = account("x");
        assert_eq!(v.unlock_recovery(&other, "n").await.unwrap_err(), VaultError::WrongSecret);
        assert_eq!(v.unlock_recovery("abandon abandon", "n").await.unwrap_err(), VaultError::WrongSecret);
    }

    #[tokio::test]
    async fn set_change_remove_password_round_trip() {
        let (_d, v) = vault();
        let ldk = v.setup_keychain().await.unwrap();
        let id = file(&v).vault_id;

        let phrase = v.set_password(&ldk, "one").unwrap();
        assert_eq!(v.status().state, "password");
        assert!(!v.keys.contains(&id));
        assert_eq!(*v.unlock_password("one").await.unwrap(), *ldk);

        assert_eq!(v.change_password("wrong", "two").unwrap_err(), VaultError::WrongSecret);
        v.change_password("one", "two").unwrap();
        assert_eq!(*v.unlock_password("two").await.unwrap(), *ldk);
        assert_eq!(*v.unlock_recovery(&phrase, "three").await.unwrap(), *ldk);

        v.remove_password("three").unwrap();
        assert_eq!(v.status().state, "keychain");
        assert!(file(&v).wrapped_ldk_recovery.is_none());
        assert_eq!(*v.unlock_keychain().await.unwrap(), *ldk);
    }

    #[tokio::test]
    async fn binding_an_account_replaces_the_local_password_and_keeps_the_old_phrase() {
        let (_d, v) = vault();
        let (ldk, local_phrase) = v.setup_password("local-pw").await.unwrap();
        let (dek, local_kek, salt, wdr, _) = account("account-pw");

        let local_dek = v.bind_account(&ldk, &local_kek, &salt, &dek, &wdr).unwrap();

        assert!(v.status().sync_bound);
        assert_eq!(*open_local_dek(&ldk, &local_dek).unwrap(), dek);
        assert_eq!(*v.unlock_password("account-pw").await.unwrap(), *ldk);
        assert_eq!(v.unlock_password("local-pw").await.unwrap_err(), VaultError::WrongSecret);
        assert_eq!(*v.unlock_recovery(&local_phrase, "n").await.unwrap(), *ldk);
    }

    #[tokio::test]
    async fn binding_from_keychain_mode_removes_the_keychain_entry() {
        let (_d, v) = vault();
        let ldk = v.setup_keychain().await.unwrap();
        let id = file(&v).vault_id;
        let (dek, local_kek, salt, wdr, _) = account("account-pw");
        v.bind_account(&ldk, &local_kek, &salt, &dek, &wdr).unwrap();
        assert_eq!(v.status().state, "password");
        assert!(!v.keys.contains(&id));
    }

    #[tokio::test]
    async fn the_account_recovery_phrase_opens_a_bound_vault_offline() {
        let (_d, v) = vault();
        let ldk = v.setup_keychain().await.unwrap();
        let (dek, local_kek, salt, wdr, account_phrase) = account("account-pw");
        v.bind_account(&ldk, &local_kek, &salt, &dek, &wdr).unwrap();
        assert_eq!(*v.unlock_recovery(&account_phrase, "fresh").await.unwrap(), *ldk);
        assert_eq!(*v.unlock_password("fresh").await.unwrap(), *ldk);
    }

    #[tokio::test]
    async fn a_bound_vault_refuses_to_drop_or_change_its_password() {
        let (_d, v) = vault();
        let ldk = v.setup_keychain().await.unwrap();
        let (dek, local_kek, salt, wdr, _) = account("account-pw");
        v.bind_account(&ldk, &local_kek, &salt, &dek, &wdr).unwrap();
        assert!(matches!(v.remove_password("account-pw"), Err(VaultError::InvalidState(_))));
        assert!(matches!(v.change_password("account-pw", "x"), Err(VaultError::InvalidState(_))));
    }

    #[tokio::test]
    async fn unbinding_keeps_the_account_password_as_the_local_one() {
        let (_d, v) = vault();
        let ldk = v.setup_keychain().await.unwrap();
        let (dek, local_kek, salt, wdr, _) = account("account-pw");
        v.bind_account(&ldk, &local_kek, &salt, &dek, &wdr).unwrap();
        v.unbind_account().unwrap();
        let f = file(&v);
        assert!(f.wrapped_ldk_by_dek.is_none() && f.wrapped_dek_recovery.is_none());
        assert!(!v.status().sync_bound);
        assert_eq!(*v.unlock_password("account-pw").await.unwrap(), *ldk);
        v.remove_password("account-pw").unwrap();
    }

    #[tokio::test]
    async fn a_legacy_database_is_migrated_by_setup() {
        let (d, v) = vault();
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(sqlx::sqlite::SqliteConnectOptions::new()
                .filename(d.path().join(crate::db::DB_FILE)).create_if_missing(true))
            .await.unwrap();
        sqlx::query("CREATE TABLE t (id TEXT)").execute(&pool).await.unwrap();
        pool.close().await;
        assert_eq!(v.status().state, "legacy-plaintext");

        v.setup_keychain().await.unwrap();

        let s = v.status();
        assert_eq!((s.state, s.migrating), ("keychain", false));
        assert!(!crate::vault::migrate::is_plaintext_sqlite(&d.path().join(crate::db::DB_FILE)).unwrap());
    }

    #[tokio::test]
    async fn an_interrupted_migration_is_finished_by_unlock() {
        let (d, v) = vault();
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .connect_with(sqlx::sqlite::SqliteConnectOptions::new()
                .filename(d.path().join(crate::db::DB_FILE)).create_if_missing(true))
            .await.unwrap();
        sqlx::query("CREATE TABLE t (id TEXT)").execute(&pool).await.unwrap();
        pool.close().await;
        // Simulate a crash right after vault.json was written.
        let ldk = generate_ldk();
        v.keys.set("id", &ldk).unwrap();
        save(d.path(), &VaultFile {
            version: FILE_VERSION, vault_id: "id".into(), mode: VaultMode::Keychain,
            salt: None, kdf: None, wrapped_ldk: None, wrapped_ldk_recovery: None,
            wrapped_ldk_by_dek: None, wrapped_dek_recovery: None,
            migration: Some(MigrationMarker::Pending),
        }).unwrap();
        assert!(v.status().migrating);

        v.unlock_keychain().await.unwrap();

        assert!(!v.status().migrating);
        assert!(!crate::vault::migrate::is_plaintext_sqlite(&d.path().join(crate::db::DB_FILE)).unwrap());
    }

    #[test]
    fn an_encrypted_database_without_vault_json_is_broken() {
        let (d, v) = vault();
        std::fs::write(d.path().join(crate::db::DB_FILE), [0xAAu8; 64]).unwrap();
        let s = v.status();
        assert_eq!((s.state, s.broken_reason), ("broken", Some("vault-missing")));
    }

    #[test]
    fn an_unreadable_vault_json_is_broken() {
        let (d, v) = vault();
        std::fs::write(d.path().join(VAULT_FILE), "{").unwrap();
        let s = v.status();
        assert_eq!((s.state, s.broken_reason), ("broken", Some("corrupt")));
    }

    #[tokio::test]
    async fn setup_refuses_to_overwrite_an_existing_vault() {
        let (_d, v) = vault();
        v.setup_keychain().await.unwrap();
        assert!(matches!(v.setup_password("pw").await, Err(VaultError::InvalidState(_))));
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test vault::service`
Expected: compile errors.

- [ ] **Step 3: Implement**

Top of `src-tauri/src/vault/service.rs`:

```rust
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::file::{load, new_vault_id, save, MigrationMarker, VaultFile, VaultMode, FILE_VERSION, VAULT_FILE};
use super::keys::{
    generate_ldk, local_kek_from_password, recovery_kek, seal_local_dek, unwrap_key, wrap_key, Key,
    AAD_LDK, AAD_LDK_DEK, AAD_LDK_RECOVERY,
};
use super::keystore::KeyStore;
use super::migrate::{encrypt_legacy_backups, is_plaintext_sqlite, migrate};
use super::VaultError;
use crate::crypto::account::KdfParams;
use crate::crypto::derive::generate_auth_salt;
use crate::crypto::recovery::generate_recovery_phrase;
use crate::crypto::wrap::{open as open_blob, AAD_DEK_RECOVERY};
use crate::db::DB_FILE;

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatusReport {
    pub state: &'static str,
    pub migrating: bool,
    pub sync_bound: bool,
    pub broken_reason: Option<&'static str>,
}

impl VaultStatusReport {
    fn plain(state: &'static str) -> Self {
        Self { state, migrating: false, sync_bound: false, broken_reason: None }
    }
    fn broken(reason: &'static str) -> Self {
        Self { broken_reason: Some(reason), ..Self::plain("broken") }
    }
}

pub struct Vault<K: KeyStore> {
    dir: PathBuf,
    keys: K,
}

fn invalid(what: &str) -> VaultError {
    VaultError::InvalidState(what.into())
}

impl<K: KeyStore> Vault<K> {
    pub fn new(dir: PathBuf, keys: K) -> Self {
        Self { dir, keys }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    fn file(&self) -> Result<VaultFile, VaultError> {
        load(&self.dir)?.ok_or_else(|| invalid("no vault"))
    }

    pub fn status(&self) -> VaultStatusReport {
        let db = self.dir.join(DB_FILE);
        match load(&self.dir) {
            Err(_) => VaultStatusReport::broken("corrupt"),
            Ok(None) if !db.exists() => VaultStatusReport::plain("fresh"),
            Ok(None) => match is_plaintext_sqlite(&db) {
                Ok(true) => VaultStatusReport::plain("legacy-plaintext"),
                // Encrypted (or unreadable) bytes with no wrappings to open them.
                _ => VaultStatusReport::broken("vault-missing"),
            },
            Ok(Some(f)) => VaultStatusReport {
                state: match f.mode {
                    VaultMode::Keychain => "keychain",
                    VaultMode::Password => "password",
                },
                migrating: f.migration.is_some(),
                sync_bound: f.wrapped_ldk_by_dek.is_some(),
                broken_reason: None,
            },
        }
    }

    fn assert_setup_allowed(&self) -> Result<bool, VaultError> {
        match self.status().state {
            "fresh" => Ok(false),
            "legacy-plaintext" => Ok(true),
            _ => Err(invalid("a vault already exists")),
        }
    }

    fn base_file(mode: VaultMode, legacy: bool) -> VaultFile {
        VaultFile {
            version: FILE_VERSION,
            vault_id: new_vault_id(),
            mode,
            salt: None,
            kdf: None,
            wrapped_ldk: None,
            wrapped_ldk_recovery: None,
            wrapped_ldk_by_dek: None,
            wrapped_dek_recovery: None,
            migration: legacy.then_some(MigrationMarker::Pending),
        }
    }

    /// Writes the password wrapping into `file` under a fresh salt.
    fn wrap_under_password(file: &mut VaultFile, ldk: &[u8; 32], password: &str) -> Result<(), VaultError> {
        let salt = generate_auth_salt();
        let kek = local_kek_from_password(password, &salt)?;
        file.mode = VaultMode::Password;
        file.wrapped_ldk = Some(wrap_key(&kek, AAD_LDK, ldk));
        file.salt = Some(salt);
        file.kdf = Some(KdfParams::current());
        Ok(())
    }

    fn new_recovery(file: &mut VaultFile, ldk: &[u8; 32]) -> Result<String, VaultError> {
        let phrase = generate_recovery_phrase();
        let rk = recovery_kek(&phrase)?;
        file.wrapped_ldk_recovery = Some(wrap_key(&rk, AAD_LDK_RECOVERY, ldk));
        Ok(phrase)
    }

    async fn finish_migration(&self, mut file: VaultFile, ldk: &[u8; 32]) -> Result<(), VaultError> {
        if file.migration.is_none() {
            return Ok(());
        }
        migrate(&self.dir, ldk).await?;
        encrypt_legacy_backups(&self.dir, ldk)?;
        file.migration = None;
        save(&self.dir, &file)
    }

    pub async fn setup_keychain(&self) -> Result<Key, VaultError> {
        let legacy = self.assert_setup_allowed()?;
        let ldk = generate_ldk();
        let file = Self::base_file(VaultMode::Keychain, legacy);
        self.keys.set(&file.vault_id, &ldk)?;
        save(&self.dir, &file)?;
        self.finish_migration(file, &ldk).await?;
        Ok(ldk)
    }

    pub async fn setup_password(&self, password: &str) -> Result<(Key, String), VaultError> {
        let legacy = self.assert_setup_allowed()?;
        let ldk = generate_ldk();
        let mut file = Self::base_file(VaultMode::Password, legacy);
        Self::wrap_under_password(&mut file, &ldk, password)?;
        let phrase = Self::new_recovery(&mut file, &ldk)?;
        save(&self.dir, &file)?;
        self.finish_migration(file, &ldk).await?;
        Ok((ldk, phrase))
    }

    pub async fn unlock_keychain(&self) -> Result<Key, VaultError> {
        let file = self.file()?;
        if file.mode != VaultMode::Keychain {
            return Err(invalid("vault is not in keychain mode"));
        }
        let ldk = self.keys.get(&file.vault_id)?;
        self.finish_migration(file, &ldk).await?;
        Ok(ldk)
    }

    fn open_with_password(file: &VaultFile, password: &str) -> Result<Key, VaultError> {
        let (Some(salt), Some(wrapped)) = (&file.salt, &file.wrapped_ldk) else {
            return Err(invalid("vault has no password wrapping"));
        };
        let kek = local_kek_from_password(password, salt)?;
        Ok(unwrap_key(&kek, AAD_LDK, wrapped)?)
    }

    pub async fn unlock_password(&self, password: &str) -> Result<Key, VaultError> {
        let file = self.file()?;
        let ldk = Self::open_with_password(&file, password)?;
        self.finish_migration(file, &ldk).await?;
        Ok(ldk)
    }

    /// Tries the local phrase, then the account phrase (phrase → DEK → LDK).
    fn open_with_phrase(file: &VaultFile, phrase: &str) -> Result<Key, VaultError> {
        let rk = recovery_kek(phrase)?;
        if let Some(blob) = &file.wrapped_ldk_recovery {
            if let Ok(ldk) = unwrap_key(&rk, AAD_LDK_RECOVERY, blob) {
                return Ok(ldk);
            }
        }
        if let (Some(wdr), Some(by_dek)) = (&file.wrapped_dek_recovery, &file.wrapped_ldk_by_dek) {
            let dek = unwrap_key(&rk, AAD_DEK_RECOVERY, wdr)?;
            return Ok(unwrap_key(&dek, AAD_LDK_DEK, by_dek)?);
        }
        Err(VaultError::WrongSecret)
    }

    pub async fn unlock_recovery(&self, phrase: &str, new_password: &str) -> Result<Key, VaultError> {
        let mut file = self.file()?;
        if file.mode != VaultMode::Password {
            return Err(invalid("vault is not in password mode"));
        }
        let ldk = Self::open_with_phrase(&file, phrase)?;
        Self::wrap_under_password(&mut file, &ldk, new_password)?;
        save(&self.dir, &file)?;
        self.finish_migration(file, &ldk).await?;
        Ok(ldk)
    }

    pub fn set_password(&self, ldk: &[u8; 32], password: &str) -> Result<String, VaultError> {
        let mut file = self.file()?;
        if file.mode != VaultMode::Keychain {
            return Err(invalid("a password is already set"));
        }
        Self::wrap_under_password(&mut file, ldk, password)?;
        let phrase = Self::new_recovery(&mut file, ldk)?;
        save(&self.dir, &file)?;
        // Only after the password wrapping is durable: dropping the keychain
        // entry first would leave a window with no way in.
        self.keys.delete(&file.vault_id)?;
        Ok(phrase)
    }

    pub fn change_password(&self, current: &str, new_password: &str) -> Result<(), VaultError> {
        let mut file = self.file()?;
        if file.wrapped_ldk_by_dek.is_some() {
            return Err(invalid("the password belongs to the sync account"));
        }
        let ldk = Self::open_with_password(&file, current)?;
        Self::wrap_under_password(&mut file, &ldk, new_password)?;
        save(&self.dir, &file)
    }

    pub fn remove_password(&self, current: &str) -> Result<(), VaultError> {
        let mut file = self.file()?;
        if file.wrapped_ldk_by_dek.is_some() {
            return Err(invalid("a synced vault always needs its password"));
        }
        let ldk = Self::open_with_password(&file, current)?;
        self.keys.set(&file.vault_id, &ldk)?;
        file.mode = VaultMode::Keychain;
        file.salt = None;
        file.kdf = None;
        file.wrapped_ldk = None;
        file.wrapped_ldk_recovery = None;
        save(&self.dir, &file)
    }

    pub fn bind_account(
        &self,
        ldk: &[u8; 32],
        local_kek: &[u8; 32],
        salt: &str,
        dek: &[u8; 32],
        wrapped_dek_recovery: &str,
    ) -> Result<String, VaultError> {
        let mut file = self.file()?;
        let was_keychain = file.mode == VaultMode::Keychain;
        file.mode = VaultMode::Password;
        file.salt = Some(salt.to_owned());
        file.kdf = Some(KdfParams::current());
        file.wrapped_ldk = Some(wrap_key(local_kek, AAD_LDK, ldk));
        file.wrapped_ldk_by_dek = Some(wrap_key(dek, AAD_LDK_DEK, ldk));
        file.wrapped_dek_recovery = Some(wrapped_dek_recovery.to_owned());
        save(&self.dir, &file)?;
        if was_keychain {
            self.keys.delete(&file.vault_id)?;
        }
        Ok(seal_local_dek(ldk, dek))
    }

    pub fn unbind_account(&self) -> Result<(), VaultError> {
        let mut file = self.file()?;
        file.wrapped_ldk_by_dek = None;
        file.wrapped_dek_recovery = None;
        save(&self.dir, &file)
    }
}
```

`open_blob` is unused if you rely on `unwrap_key` everywhere — remove that import if the compiler warns. `VAULT_FILE` is used only by the tests; import it inside the test module instead if it warns.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test vault::`
Expected: every `vault::` test passes (Argon2id makes this suite take ~20–40 s).

- [ ] **Step 5: Checkpoint** — no commit.

---

### Task 7: Tauri wiring (`vault/commands.rs`, `crypto/state.rs`, `db.rs`, `lib.rs`)

**Files:**
- Create: `src-tauri/src/vault/commands.rs`
- Modify: `src-tauri/src/vault/mod.rs` (add `pub mod commands;`)
- Modify: `src-tauri/src/crypto/state.rs`
- Modify: `src-tauri/src/db.rs` (replace plugin `init`/`register`/`database_path` with `open_and_register`)
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `Vault<OsKeyStore>` (Task 6), `db::build_pool` (Task 1).
- Produces:
  - `CryptoState::take_bind_material(&mut self) -> Result<(Key, String, [u8; 32]), CryptoError>` (local KEK, salt, DEK) and `CryptoState::unlock_with_dek(&mut self, dek: [u8; 32], user_id: &str)`.
  - `db::open_and_register<R: Runtime>(app: &AppHandle<R>, dir: &Path, ldk: &[u8; 32]) -> Result<(), VaultError>`
  - Tauri commands (JS names): `vault_status`, `vault_setup_keychain`, `vault_setup_password(password) -> string`, `vault_unlock_keychain`, `vault_unlock_password(password)`, `vault_unlock_recovery(phrase, newPassword)`, `vault_set_password(password) -> string`, `vault_change_password(current, newPassword)`, `vault_remove_password(current)`, `vault_bind_account(wrappedDekRecovery) -> string`, `vault_unbind_account`, `vault_unlock_sync(localDek, userId)`, `vault_seal_backup(plaintext) -> string`, `vault_open_backup(blob) -> string`. Errors reach JS as `{ code, detail? }`.

- [ ] **Step 1: Write the failing `CryptoState` tests**

Add to `src-tauri/src/crypto/state.rs` tests:

```rust
    #[test]
    fn a_completed_unlock_leaves_bind_material_once() {
        let m = prepare_registration("correct horse").unwrap();
        let mut state = CryptoState::default();
        state.begin_unlock("correct horse", &m.auth_salt).unwrap();
        state.complete_unlock(&m.wrapped_dek, "user-1").unwrap();

        let (local_kek, salt, dek) = state.take_bind_material().unwrap();
        assert_eq!(salt, m.auth_salt);
        assert_eq!(dek, dek_and_user(&state).unwrap().0);
        let master = crate::crypto::derive::derive_master_key("correct horse", &m.auth_salt).unwrap();
        assert_eq!(*local_kek, *crate::vault::keys::local_kek_from_master(&master));
        // Consumed: a second bind cannot reuse it.
        assert_eq!(state.take_bind_material().unwrap_err(), CryptoError::Locked);
    }

    #[test]
    fn locking_drops_bind_material() {
        let m = prepare_registration("correct horse").unwrap();
        let mut state = CryptoState::default();
        state.begin_unlock("correct horse", &m.auth_salt).unwrap();
        state.complete_unlock(&m.wrapped_dek, "user-1").unwrap();
        state.lock();
        assert_eq!(state.take_bind_material().unwrap_err(), CryptoError::Locked);
    }

    #[test]
    fn a_local_dek_unlocks_the_sync_vault() {
        let mut state = CryptoState::default();
        state.unlock_with_dek([3u8; 32], "user-9");
        assert_eq!(dek_and_user(&state).unwrap(), ([3u8; 32], "user-9".to_string()));
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd src-tauri && cargo test crypto::state`
Expected: compile errors (`take_bind_material` not found).

- [ ] **Step 3: Implement the `CryptoState` changes**

In `src-tauri/src/crypto/state.rs`:

```rust
#[derive(Default)]
pub struct CryptoState {
    pending_master_key: Option<[u8; 32]>,
    /// The salt `begin_unlock` was given, kept for the bind material.
    pending_salt: Option<String>,
    /// Set by `complete_unlock`: what `vault_bind_account` needs to re-wrap the
    /// local database key under the account password without a second
    /// Argon2id pass. Consumed once, dropped on lock.
    bind: Option<(crate::vault::keys::Key, String)>,
    dek: Option<[u8; 32]>,
    user_id: Option<String>,
}
```

In `begin_unlock`, after `self.clear_pending();` add `self.pending_salt = Some(auth_salt.to_owned());`.

In `complete_unlock`, right after `let mut kek = derive_kek(&master_key);` add:

```rust
        let local_kek = crate::vault::keys::local_kek_from_master(&master_key);
        let salt = self.pending_salt.take().unwrap_or_default();
```

and replace the final `self.store_dek(opened?, user_id)` with:

```rust
        self.store_dek(opened?, user_id)?;
        self.bind = Some((local_kek, salt));
        Ok(())
```

Add methods:

```rust
    pub fn take_bind_material(
        &mut self,
    ) -> Result<(crate::vault::keys::Key, String, [u8; 32]), CryptoError> {
        let dek = self.dek.ok_or(CryptoError::Locked)?;
        let (kek, salt) = self.bind.take().ok_or(CryptoError::Locked)?;
        Ok((kek, salt, dek))
    }

    pub fn unlock_with_dek(&mut self, dek: [u8; 32], user_id: &str) {
        self.dek = Some(dek);
        self.user_id = Some(user_id.to_owned());
    }
```

In `clear_pending`, also `self.pending_salt = None;`. In `lock`, also `self.bind = None;` (`Zeroizing` scrubs on drop).

Run: `cd src-tauri && cargo test crypto::`
Expected: all pass.

- [ ] **Step 4: Replace the startup plugin in `db.rs`**

In `src-tauri/src/db.rs`, delete `init`, `register` and `database_path`, and add:

```rust
/// Called by the vault commands once the key is known — never at startup:
/// until then there is nothing the pool could decrypt.
pub fn open_and_register<R: Runtime>(
    app: &AppHandle<R>,
    dir: &Path,
    ldk: &[u8; 32],
) -> Result<(), crate::vault::VaultError> {
    let path = dir.join(DB_FILE);
    let pool = tauri::async_runtime::block_on(build_pool(&path, ldk))
        .map_err(|e| crate::vault::VaultError::Io(e.to_string()))?;
    let instances = app.state::<DbInstances>();
    tauri::async_runtime::block_on(async {
        instances
            .0
            .write()
            .await
            .insert(DB_URL.to_string(), DbPool::Sqlite(pool));
    });
    Ok(())
}
```

Update the module doc's "Register the pool as a plugin" paragraph: the pool is now registered by `vault::commands` after unlock; the frontend's `Database.get` still finds it under `DB_URL`. Remove now-unused imports (`PluginBuilder`, `TauriPlugin`, `PathBuf`).

Because the commands below are `async`, `block_on` inside them would deadlock the runtime. `open_and_register` is only ever called from `tauri::async_runtime::spawn_blocking` (Step 5).

- [ ] **Step 5: Write `vault/commands.rs`**

```rust
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime, State};
// Commands take the default (Wry) AppHandle: generic commands would need a
// turbofish in both generate_handler! lists.
use zeroize::Zeroizing;

use super::keys::{open_backup, open_local_dek, seal_backup, Key};
use super::keystore::OsKeyStore;
use super::service::{Vault, VaultStatusReport};
use super::VaultError;
use crate::crypto::state::CryptoState;

pub struct VaultRuntime {
    vault: Vault<OsKeyStore>,
    /// The open database's key, held for the process lifetime: the Security
    /// tab and the backup commands need it after unlock.
    ldk: Mutex<Option<Key>>,
}

impl VaultRuntime {
    pub fn new(dir: PathBuf) -> Self {
        Self { vault: Vault::new(dir, OsKeyStore), ldk: Mutex::new(None) }
    }

    fn ldk(&self) -> Result<Key, VaultError> {
        self.ldk
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
            .ok_or_else(|| VaultError::InvalidState("database is locked".into()))
    }

    fn is_open(&self) -> bool {
        self.ldk.lock().unwrap_or_else(|e| e.into_inner()).is_some()
    }
}

type Rt<'a> = State<'a, VaultRuntime>;
type Crypto<'a> = State<'a, Mutex<CryptoState>>;

async fn open(app: &AppHandle, rt: &VaultRuntime, ldk: Key) -> Result<(), VaultError> {
    let (app2, dir, key) = (app.clone(), rt.vault.dir().to_path_buf(), ldk.clone());
    tauri::async_runtime::spawn_blocking(move || crate::db::open_and_register(&app2, &dir, &key))
        .await
        .map_err(|e| VaultError::Io(e.to_string()))??;
    *rt.ldk.lock().unwrap_or_else(|e| e.into_inner()) = Some(ldk);
    Ok(())
}

#[tauri::command]
pub fn vault_status(rt: Rt<'_>) -> VaultStatusReport {
    rt.vault.status()
}

#[tauri::command]
pub async fn vault_setup_keychain(app: AppHandle, rt: Rt<'_>) -> Result<(), VaultError> {
    let ldk = rt.vault.setup_keychain().await?;
    open(&app, &rt, ldk).await
}

#[tauri::command]
pub async fn vault_setup_password(
    app: AppHandle,
    rt: Rt<'_>,
    password: String,
) -> Result<String, VaultError> {
    let password = Zeroizing::new(password);
    let (ldk, phrase) = rt.vault.setup_password(&password).await?;
    open(&app, &rt, ldk).await?;
    Ok(phrase)
}

#[tauri::command]
pub async fn vault_unlock_keychain(app: AppHandle, rt: Rt<'_>) -> Result<(), VaultError> {
    // StrictMode runs the gate's auto-unlock effect twice in dev.
    if rt.is_open() {
        return Ok(());
    }
    let ldk = rt.vault.unlock_keychain().await?;
    open(&app, &rt, ldk).await
}

#[tauri::command]
pub async fn vault_unlock_password(
    app: AppHandle,
    rt: Rt<'_>,
    password: String,
) -> Result<(), VaultError> {
    let password = Zeroizing::new(password);
    let ldk = rt.vault.unlock_password(&password).await?;
    open(&app, &rt, ldk).await
}

#[tauri::command]
pub async fn vault_unlock_recovery(
    app: AppHandle,
    rt: Rt<'_>,
    phrase: String,
    new_password: String,
) -> Result<(), VaultError> {
    let (phrase, new_password) = (Zeroizing::new(phrase), Zeroizing::new(new_password));
    let ldk = rt.vault.unlock_recovery(&phrase, &new_password).await?;
    open(&app, &rt, ldk).await
}

#[tauri::command]
pub fn vault_set_password(rt: Rt<'_>, password: String) -> Result<String, VaultError> {
    let password = Zeroizing::new(password);
    rt.vault.set_password(&rt.ldk()?, &password)
}

#[tauri::command]
pub fn vault_change_password(rt: Rt<'_>, current: String, new_password: String) -> Result<(), VaultError> {
    let (current, new_password) = (Zeroizing::new(current), Zeroizing::new(new_password));
    rt.vault.change_password(&current, &new_password)
}

#[tauri::command]
pub fn vault_remove_password(rt: Rt<'_>, current: String) -> Result<(), VaultError> {
    let current = Zeroizing::new(current);
    rt.vault.remove_password(&current)
}

#[tauri::command]
pub fn vault_bind_account(
    rt: Rt<'_>,
    crypto: Crypto<'_>,
    wrapped_dek_recovery: String,
) -> Result<String, VaultError> {
    let ldk = rt.ldk()?;
    let (local_kek, salt, dek) = crypto
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take_bind_material()
        .map_err(|_| VaultError::InvalidState("no completed account unlock to bind".into()))?;
    let dek = Zeroizing::new(dek);
    rt.vault.bind_account(&ldk, &local_kek, &salt, &dek, &wrapped_dek_recovery)
}

#[tauri::command]
pub fn vault_unbind_account(rt: Rt<'_>) -> Result<(), VaultError> {
    rt.vault.unbind_account()
}

#[tauri::command]
pub fn vault_unlock_sync(
    rt: Rt<'_>,
    crypto: Crypto<'_>,
    local_dek: String,
    user_id: String,
) -> Result<(), VaultError> {
    let dek = open_local_dek(&rt.ldk()?, &local_dek)?;
    crypto.lock().unwrap_or_else(|e| e.into_inner()).unlock_with_dek(*dek, &user_id);
    Ok(())
}

#[tauri::command]
pub fn vault_seal_backup(rt: Rt<'_>, plaintext: String) -> Result<String, VaultError> {
    Ok(seal_backup(&rt.ldk()?, plaintext.as_bytes()))
}

#[tauri::command]
pub fn vault_open_backup(rt: Rt<'_>, blob: String) -> Result<String, VaultError> {
    let bytes = open_backup(&rt.ldk()?, &blob)?;
    String::from_utf8(bytes).map_err(|_| VaultError::WrongSecret)
}

pub fn manage<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let dir = app.path().app_config_dir()?;
    std::fs::create_dir_all(&dir)?;
    app.manage(VaultRuntime::new(dir));
    Ok(())
}
```

`Key` is `Zeroizing<[u8; 32]>`, which implements `Clone`; if the compiler complains in `ldk()`, use `.as_ref().map(|k| Zeroizing::new(**k))`.

- [ ] **Step 6: Wire `lib.rs`**

In `src-tauri/src/lib.rs`:
- Remove `.plugin(db::init());` and its comment; keep `.plugin(tauri_plugin_sql::Builder::new().build())` — it still owns `DbInstances`.
- After `let builder = builder.manage(...CryptoState...)`, add:

```rust
    let builder = builder.setup(|app| vault::commands::manage(app.handle()));
```

- Append to **both** `generate_handler!` lists:

```rust
            vault::commands::vault_status,
            vault::commands::vault_setup_keychain,
            vault::commands::vault_setup_password,
            vault::commands::vault_unlock_keychain,
            vault::commands::vault_unlock_password,
            vault::commands::vault_unlock_recovery,
            vault::commands::vault_set_password,
            vault::commands::vault_change_password,
            vault::commands::vault_remove_password,
            vault::commands::vault_bind_account,
            vault::commands::vault_unbind_account,
            vault::commands::vault_unlock_sync,
            vault::commands::vault_seal_backup,
            vault::commands::vault_open_backup,
```

- [ ] **Step 7: Build and run the whole Rust suite**

Run: `cd src-tauri && cargo build && cargo test`
Expected: builds; all tests pass. `cargo clippy` introduces no new warnings in `vault/`.

- [ ] **Step 8: Checkpoint** — no commit. (The app is not runnable end-to-end until Task 9.)

---

### Task 8: JS vault API (`src/vault`)

**Files:**
- Create: `src/vault/types.ts`
- Create: `src/vault/index.ts`
- Test: `src/vault/index.test.ts`

**Interfaces:**
- Produces (`@/vault`):
  - types `VaultState`, `VaultStatus`, `VaultErrorCode`, `VaultError`, `VaultApi`
  - `isVaultError(e: unknown): e is VaultError`
  - `tauriVaultApi: VaultApi` with methods `status()`, `setupKeychain()`, `setupPassword(password) → Promise<string>`, `unlockKeychain()`, `unlockPassword(password)`, `unlockRecovery(phrase, newPassword)`, `setPassword(password) → Promise<string>`, `changePassword(current, newPassword)`, `removePassword(current)`
  - free functions `bindAccount(wrappedDekRecovery) → Promise<string>`, `unbindAccount()`, `unlockSync(localDek, userId)`, `sealBackup(plaintext) → Promise<string>`, `openBackup(blob) → Promise<string>`

- [ ] **Step 1: Write the types**

`src/vault/types.ts`:

```ts
export type VaultState =
	| "fresh"
	| "legacy-plaintext"
	| "keychain"
	| "password"
	| "broken";

export interface VaultStatus {
	state: VaultState;
	/** A plaintext → encrypted migration was interrupted; unlocking resumes it. */
	migrating: boolean;
	/** The database key is also wrapped by the sync account's DEK. */
	syncBound: boolean;
	brokenReason: "corrupt" | "vault-missing" | null;
}

export type VaultErrorCode =
	| "wrong-secret"
	| "keychain-denied"
	| "key-missing"
	| "corrupt"
	| "migration-failed"
	| "io"
	| "invalid-state";

/** The shape Rust's VaultError serializes to. */
export interface VaultError {
	code: VaultErrorCode;
	detail?: string;
}

/** Injected into the gate and the Security tab so tests need no Tauri runtime. */
export interface VaultApi {
	status(): Promise<VaultStatus>;
	setupKeychain(): Promise<void>;
	/** Resolves with the 24-word recovery phrase: show once, never persist. */
	setupPassword(password: string): Promise<string>;
	unlockKeychain(): Promise<void>;
	unlockPassword(password: string): Promise<void>;
	unlockRecovery(phrase: string, newPassword: string): Promise<void>;
	/** Resolves with the 24-word recovery phrase: show once, never persist. */
	setPassword(password: string): Promise<string>;
	changePassword(current: string, newPassword: string): Promise<void>;
	removePassword(current: string): Promise<void>;
}
```

- [ ] **Step 2: Write the failing test**

`src/vault/index.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const { isVaultError, tauriVaultApi, bindAccount, unlockSync } = await import(
	"./index"
);

describe("vault IPC", () => {
	beforeEach(() => invoke.mockReset());

	it("passes camelCase arguments the Rust commands expect", async () => {
		invoke.mockResolvedValue(undefined);
		await tauriVaultApi.unlockRecovery("words", "new-pw");
		expect(invoke).toHaveBeenCalledWith("vault_unlock_recovery", {
			phrase: "words",
			newPassword: "new-pw",
		});
		await unlockSync("blob", "user-1");
		expect(invoke).toHaveBeenLastCalledWith("vault_unlock_sync", {
			localDek: "blob",
			userId: "user-1",
		});
	});

	it("returns what Rust returns", async () => {
		invoke.mockResolvedValue("sealed");
		await expect(bindAccount("wdr")).resolves.toBe("sealed");
		expect(invoke).toHaveBeenCalledWith("vault_bind_account", {
			wrappedDekRecovery: "wdr",
		});
	});

	it("recognises a serialized VaultError", () => {
		expect(isVaultError({ code: "wrong-secret" })).toBe(true);
		expect(isVaultError({ code: "io", detail: "disk" })).toBe(true);
		expect(isVaultError(new Error("x"))).toBe(false);
		expect(isVaultError("wrong-secret")).toBe(false);
	});
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/vault`
Expected: FAIL, cannot resolve `./index`.

- [ ] **Step 4: Implement**

`src/vault/index.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import type { VaultApi, VaultError, VaultErrorCode, VaultStatus } from "./types";

export type {
	VaultApi,
	VaultError,
	VaultErrorCode,
	VaultState,
	VaultStatus,
} from "./types";

// The database key and the DEK never cross this boundary: every call below
// sends a password or a sealed blob and gets back a sealed blob, a recovery
// phrase (shown once, never persisted), or nothing.

const CODES: ReadonlySet<VaultErrorCode> = new Set([
	"wrong-secret",
	"keychain-denied",
	"key-missing",
	"corrupt",
	"migration-failed",
	"io",
	"invalid-state",
]);

export function isVaultError(e: unknown): e is VaultError {
	return (
		typeof e === "object" &&
		e !== null &&
		CODES.has((e as { code?: unknown }).code as VaultErrorCode)
	);
}

export const tauriVaultApi: VaultApi = {
	status: () => invoke<VaultStatus>("vault_status"),
	setupKeychain: () => invoke("vault_setup_keychain"),
	setupPassword: (password) =>
		invoke<string>("vault_setup_password", { password }),
	unlockKeychain: () => invoke("vault_unlock_keychain"),
	unlockPassword: (password) => invoke("vault_unlock_password", { password }),
	unlockRecovery: (phrase, newPassword) =>
		invoke("vault_unlock_recovery", { phrase, newPassword }),
	setPassword: (password) => invoke<string>("vault_set_password", { password }),
	changePassword: (current, newPassword) =>
		invoke("vault_change_password", { current, newPassword }),
	removePassword: (current) => invoke("vault_remove_password", { current }),
};

export function bindAccount(wrappedDekRecovery: string): Promise<string> {
	return invoke<string>("vault_bind_account", { wrappedDekRecovery });
}

export function unbindAccount(): Promise<void> {
	return invoke("vault_unbind_account");
}

export function unlockSync(localDek: string, userId: string): Promise<void> {
	return invoke("vault_unlock_sync", { localDek, userId });
}

export function sealBackup(plaintext: string): Promise<string> {
	return invoke<string>("vault_seal_backup", { plaintext });
}

export function openBackup(blob: string): Promise<string> {
	return invoke<string>("vault_open_backup", { blob });
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm vitest run src/vault`
Expected: 3 passed.

- [ ] **Step 6: Checkpoint** — no commit.

---

### Task 9: `VaultGate` and startup integration

**Files:**
- Create: `src/components/vault/VaultGate.tsx`, `SetupScreen.tsx`, `UnlockScreen.tsx`, `RecoverScreen.tsx`, `VaultMessage.tsx`
- Test: `src/components/vault/VaultGate.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/i18n/locales/en.ts`, `src/i18n/locales/fr.ts`

**Interfaces:**
- Consumes: `VaultApi`, `isVaultError` (Task 8); `RecoveryPhraseStep` (`@/components/sync/RecoveryPhraseStep`, props `{ phrase, onConfirmed, random? }`).
- Produces: `export function VaultGate({ api, children, random }: { api?: VaultApi; children: ReactNode; random?: () => number })` — renders `children` only once the database is open.

- [ ] **Step 1: Add the strings**

In `src/i18n/locales/en.ts`, add a top-level `vault` section (after `sync`):

```ts
	vault: {
		setupTitle: "Protect your data",
		setupIntro:
			"Bunly encrypts everything it stores on this device. Choose a password to unlock it, or let this device unlock it for you.",
		legacyNotice: "Your existing data will now be encrypted.",
		password: "Password",
		confirmPassword: "Confirm password",
		mismatch: "The passwords do not match.",
		protect: "Protect with a password",
		noPassword: "Continue without a password",
		noPasswordHint:
			"The key is kept in this computer's keychain. Anyone using your session can open Bunly, and if the keychain entry is lost, so is your data.",
		working: "Encrypting…",
		unlockTitle: "Bunly is locked",
		unlock: "Unlock",
		unlocking: "Unlocking…",
		wrongSecret: "That did not work. Check what you typed and try again.",
		forgot: "Forgot your password?",
		recoverTitle: "Unlock with your recovery key",
		recoverIntro:
			"Enter your 24-word recovery key, then choose a new password.",
		recoverSyncHint:
			"Your sync account's recovery key works too. Your account password stays the same on the server.",
		recoveryPhrase: "Recovery key",
		newPassword: "New password",
		recover: "Unlock and set password",
		back: "Back",
		keychainDenied:
			"Bunly could not read its key from the keychain. Allow access, then try again.",
		retry: "Try again",
		migrationFailed:
			"Encrypting your data failed. Nothing was lost — your data is untouched. Try again.",
		brokenTitle: "Your data cannot be opened",
		brokenKeyMissing:
			"This device's key is no longer in the keychain. Without it the encrypted data cannot be read.",
		brokenVaultMissing:
			"The file that unlocks your data (vault.json) is missing.",
		brokenCorrupt: "The file that unlocks your data (vault.json) is damaged.",
		genericError: "Something went wrong: {{detail}}",
	},
```

In `fr.ts`, the same keys:

```ts
	vault: {
		setupTitle: "Protéger vos données",
		setupIntro:
			"Bunly chiffre tout ce qu'il enregistre sur cet appareil. Choisissez un mot de passe pour le déverrouiller, ou laissez cet appareil le faire pour vous.",
		legacyNotice: "Vos données existantes vont désormais être chiffrées.",
		password: "Mot de passe",
		confirmPassword: "Confirmer le mot de passe",
		mismatch: "Les mots de passe ne correspondent pas.",
		protect: "Protéger par un mot de passe",
		noPassword: "Continuer sans mot de passe",
		noPasswordHint:
			"La clé est conservée dans le trousseau de cet ordinateur. Toute personne utilisant votre session peut ouvrir Bunly, et si l'entrée du trousseau est perdue, vos données le sont aussi.",
		working: "Chiffrement…",
		unlockTitle: "Bunly est verrouillé",
		unlock: "Déverrouiller",
		unlocking: "Déverrouillage…",
		wrongSecret: "Cela n'a pas fonctionné. Vérifiez votre saisie et réessayez.",
		forgot: "Mot de passe oublié ?",
		recoverTitle: "Déverrouiller avec la clé de récupération",
		recoverIntro:
			"Saisissez votre clé de récupération de 24 mots, puis choisissez un nouveau mot de passe.",
		recoverSyncHint:
			"La clé de récupération de votre compte de synchronisation fonctionne aussi. Le mot de passe du compte reste inchangé sur le serveur.",
		recoveryPhrase: "Clé de récupération",
		newPassword: "Nouveau mot de passe",
		recover: "Déverrouiller et définir le mot de passe",
		back: "Retour",
		keychainDenied:
			"Bunly n'a pas pu lire sa clé dans le trousseau. Autorisez l'accès, puis réessayez.",
		retry: "Réessayer",
		migrationFailed:
			"Le chiffrement de vos données a échoué. Rien n'est perdu — vos données sont intactes. Réessayez.",
		brokenTitle: "Vos données ne peuvent pas être ouvertes",
		brokenKeyMissing:
			"La clé de cet appareil n'est plus dans le trousseau. Sans elle, les données chiffrées sont illisibles.",
		brokenVaultMissing:
			"Le fichier qui déverrouille vos données (vault.json) est introuvable.",
		brokenCorrupt:
			"Le fichier qui déverrouille vos données (vault.json) est endommagé.",
		genericError: "Une erreur est survenue : {{detail}}",
	},
```

- [ ] **Step 2: Write the failing tests**

`src/components/vault/VaultGate.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";
import type { VaultApi, VaultStatus } from "@/vault";
import { VaultGate } from "./VaultGate";

const PHRASE = Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(" ");
const status = (over: Partial<VaultStatus>): VaultStatus => ({
	state: "password",
	migrating: false,
	syncBound: false,
	brokenReason: null,
	...over,
});

function api(over: Partial<VaultApi> = {}): VaultApi {
	return {
		status: vi.fn(async () => status({})),
		setupKeychain: vi.fn(async () => {}),
		setupPassword: vi.fn(async () => PHRASE),
		unlockKeychain: vi.fn(async () => {}),
		unlockPassword: vi.fn(async () => {}),
		unlockRecovery: vi.fn(async () => {}),
		setPassword: vi.fn(async () => PHRASE),
		changePassword: vi.fn(async () => {}),
		removePassword: vi.fn(async () => {}),
		...over,
	};
}

const APP = <p>the app</p>;
const pw = () => screen.getByLabelText(/^password$|^mot de passe$/i);

describe("VaultGate", () => {
	it("never renders the app before the database is open", async () => {
		render(<VaultGate api={api()}>{APP}</VaultGate>);
		await screen.findByRole("button", { name: /^unlock$|^déverrouiller$/i });
		expect(screen.queryByText("the app")).not.toBeInTheDocument();
	});

	it("unlocks with the right password", async () => {
		const user = userEvent.setup();
		const a = api();
		render(<VaultGate api={a}>{APP}</VaultGate>);
		await user.type(await screen.findByLabelText(/^password$|^mot de passe$/i), "pw");
		await user.click(screen.getByRole("button", { name: /^unlock$|^déverrouiller$/i }));
		expect(await screen.findByText("the app")).toBeInTheDocument();
		expect(a.unlockPassword).toHaveBeenCalledWith("pw");
	});

	it("says so on a wrong password and stays locked", async () => {
		const user = userEvent.setup();
		const a = api({
			unlockPassword: vi.fn(async () => {
				throw { code: "wrong-secret" };
			}),
		});
		render(<VaultGate api={a}>{APP}</VaultGate>);
		await user.type(await screen.findByLabelText(/^password$|^mot de passe$/i), "nope");
		await user.click(screen.getByRole("button", { name: /^unlock$|^déverrouiller$/i }));
		expect(await screen.findByText(/did not work|n'a pas fonctionné/i)).toBeInTheDocument();
		expect(screen.queryByText("the app")).not.toBeInTheDocument();
	});

	it("unlocks by itself in keychain mode, once", async () => {
		const a = api({ status: vi.fn(async () => status({ state: "keychain" })) });
		render(<VaultGate api={a}>{APP}</VaultGate>);
		expect(await screen.findByText("the app")).toBeInTheDocument();
		expect(a.unlockKeychain).toHaveBeenCalledTimes(1);
	});

	it("offers a retry when the keychain refuses", async () => {
		const user = userEvent.setup();
		const unlockKeychain = vi
			.fn()
			.mockRejectedValueOnce({ code: "keychain-denied", detail: "x" })
			.mockResolvedValueOnce(undefined);
		render(
			<VaultGate api={api({ status: vi.fn(async () => status({ state: "keychain" })), unlockKeychain })}>
				{APP}
			</VaultGate>,
		);
		await user.click(await screen.findByRole("button", { name: /try again|réessayer/i }));
		expect(await screen.findByText("the app")).toBeInTheDocument();
	});

	it("sets up without a password on a fresh install", async () => {
		const user = userEvent.setup();
		const a = api({ status: vi.fn(async () => status({ state: "fresh" })) });
		render(<VaultGate api={a}>{APP}</VaultGate>);
		await user.click(await screen.findByRole("button", { name: /without a password|sans mot de passe/i }));
		expect(await screen.findByText("the app")).toBeInTheDocument();
		expect(a.setupKeychain).toHaveBeenCalled();
	});

	it("refuses mismatched passwords at setup", async () => {
		const user = userEvent.setup();
		const a = api({ status: vi.fn(async () => status({ state: "fresh" })) });
		render(<VaultGate api={a}>{APP}</VaultGate>);
		await user.type(await screen.findByLabelText(/^password$|^mot de passe$/i), "one");
		await user.type(screen.getByLabelText(/confirm/i), "two");
		await user.click(screen.getByRole("button", { name: /protect with|protéger par/i }));
		expect(screen.getByText(/do not match|ne correspondent pas/i)).toBeInTheDocument();
		expect(a.setupPassword).not.toHaveBeenCalled();
	});

	it("shows the recovery key after a password setup and opens only once it is confirmed", async () => {
		const user = userEvent.setup();
		const a = api({ status: vi.fn(async () => status({ state: "legacy-plaintext" })) });
		render(<VaultGate api={a} random={() => 0}>{APP}</VaultGate>);
		expect(await screen.findByText(/will now be encrypted|vont désormais être chiffrées/i)).toBeInTheDocument();
		await user.type(pw(), "pw");
		await user.type(screen.getByLabelText(/confirm/i), "pw");
		await user.click(screen.getByRole("button", { name: /protect with|protéger par/i }));
		expect(await screen.findByText("word24")).toBeInTheDocument();
		expect(screen.queryByText("the app")).not.toBeInTheDocument();
		expect(a.setupPassword).toHaveBeenCalledWith("pw");
	});

	it("recovers with the phrase and a new password", async () => {
		const user = userEvent.setup();
		const a = api();
		render(<VaultGate api={a}>{APP}</VaultGate>);
		await user.click(await screen.findByRole("button", { name: /forgot|oublié/i }));
		await user.type(screen.getByLabelText(/recovery key|clé de récupération/i), PHRASE);
		await user.type(screen.getByLabelText(/^new password$|^nouveau mot de passe$/i), "n");
		await user.type(screen.getByLabelText(/confirm/i), "n");
		await user.click(screen.getByRole("button", { name: /set password|définir le mot de passe/i }));
		expect(await screen.findByText("the app")).toBeInTheDocument();
		expect(a.unlockRecovery).toHaveBeenCalledWith(PHRASE, "n");
	});

	it("explains a broken vault and offers nothing to click", async () => {
		render(
			<VaultGate api={api({ status: vi.fn(async () => status({ state: "broken", brokenReason: "vault-missing" })) })}>
				{APP}
			</VaultGate>,
		);
		expect(await screen.findByText(/vault\.json/)).toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("reports a failed migration without losing the form", async () => {
		const user = userEvent.setup();
		const a = api({
			status: vi.fn(async () => status({ state: "fresh" })),
			setupKeychain: vi.fn(async () => {
				throw { code: "migration-failed", detail: "disk full" };
			}),
		});
		render(<VaultGate api={a}>{APP}</VaultGate>);
		await user.click(await screen.findByRole("button", { name: /without a password|sans mot de passe/i }));
		await waitFor(() =>
			expect(screen.getByText(/nothing was lost|rien n'est perdu/i)).toBeInTheDocument(),
		);
		expect(screen.getByRole("button", { name: /without a password|sans mot de passe/i })).toBeEnabled();
	});
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/components/vault`
Expected: FAIL, cannot resolve `./VaultGate`.

- [ ] **Step 4: Implement the shared message and the error helper**

`src/components/vault/VaultMessage.tsx`:

```tsx
import type { TFunction } from "i18next";
import { isVaultError } from "@/vault";

/** One place mapping a thrown vault error to the sentence the user reads. */
export function vaultErrorMessage(t: TFunction, e: unknown): string {
	if (!isVaultError(e)) return t("vault.genericError", { detail: String(e) });
	switch (e.code) {
		case "wrong-secret":
			return t("vault.wrongSecret");
		case "keychain-denied":
			return t("vault.keychainDenied");
		case "key-missing":
			return t("vault.brokenKeyMissing");
		case "migration-failed":
			return t("vault.migrationFailed");
		case "corrupt":
			return t("vault.brokenCorrupt");
		default:
			return t("vault.genericError", { detail: e.detail ?? e.code });
	}
}

export function VaultCard({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-4">
			<div className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-popover p-6 text-sm ring-1 ring-foreground/10">
				<h1 className="text-base font-semibold">{title}</h1>
				{children}
			</div>
		</div>
	);
}
```

- [ ] **Step 5: Implement the screens**

`src/components/vault/SetupScreen.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VaultCard } from "./VaultMessage";

interface SetupScreenProps {
	legacy: boolean;
	busy: boolean;
	error: string | null;
	onPassword: (password: string) => void;
	onNoPassword: () => void;
}

export function SetupScreen({ legacy, busy, error, onPassword, onNoPassword }: SetupScreenProps) {
	const { t } = useTranslation();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [mismatch, setMismatch] = useState(false);

	function handleSubmit(e: { preventDefault(): void }) {
		e.preventDefault();
		if (password !== confirm) {
			setMismatch(true);
			return;
		}
		onPassword(password);
	}

	return (
		<VaultCard title={t("vault.setupTitle")}>
			<p className="text-muted-foreground">{t("vault.setupIntro")}</p>
			{legacy && <p className="font-medium">{t("vault.legacyNotice")}</p>}
			<form onSubmit={handleSubmit} className="flex flex-col gap-3">
				<label className="flex flex-col gap-1.5" htmlFor="vault-setup-password">
					{t("vault.password")}
					<Input id="vault-setup-password" type="password" autoComplete="new-password" value={password}
						onChange={(e) => { setPassword(e.target.value); setMismatch(false); }} />
				</label>
				<label className="flex flex-col gap-1.5" htmlFor="vault-setup-confirm">
					{t("vault.confirmPassword")}
					<Input id="vault-setup-confirm" type="password" autoComplete="new-password" value={confirm}
						onChange={(e) => { setConfirm(e.target.value); setMismatch(false); }} />
				</label>
				{mismatch && <p className="text-xs text-destructive">{t("vault.mismatch")}</p>}
				{error && <p className="text-xs text-destructive">{error}</p>}
				<Button type="submit" disabled={busy || password === ""}>
					{busy ? t("vault.working") : t("vault.protect")}
				</Button>
			</form>
			<div className="flex flex-col gap-1.5 border-t border-border pt-4">
				<Button type="button" variant="outline" disabled={busy} onClick={onNoPassword}>
					{t("vault.noPassword")}
				</Button>
				<p className="text-xs text-muted-foreground">{t("vault.noPasswordHint")}</p>
			</div>
		</VaultCard>
	);
}
```

`src/components/vault/UnlockScreen.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VaultCard } from "./VaultMessage";

interface UnlockScreenProps {
	busy: boolean;
	error: string | null;
	onUnlock: (password: string) => void;
	onForgot: () => void;
}

export function UnlockScreen({ busy, error, onUnlock, onForgot }: UnlockScreenProps) {
	const { t } = useTranslation();
	const [password, setPassword] = useState("");
	return (
		<VaultCard title={t("vault.unlockTitle")}>
			<form
				className="flex flex-col gap-3"
				onSubmit={(e) => {
					e.preventDefault();
					if (password !== "") onUnlock(password);
				}}
			>
				<label className="flex flex-col gap-1.5" htmlFor="vault-unlock-password">
					{t("vault.password")}
					<Input id="vault-unlock-password" type="password" autoComplete="current-password"
						value={password} onChange={(e) => setPassword(e.target.value)} />
				</label>
				{error && <p className="text-xs text-destructive">{error}</p>}
				<Button type="submit" disabled={busy || password === ""}>
					{busy ? t("vault.unlocking") : t("vault.unlock")}
				</Button>
			</form>
			<Button type="button" variant="ghost" size="sm" onClick={onForgot}>
				{t("vault.forgot")}
			</Button>
		</VaultCard>
	);
}
```

`src/components/vault/RecoverScreen.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VaultCard } from "./VaultMessage";

interface RecoverScreenProps {
	syncBound: boolean;
	busy: boolean;
	error: string | null;
	onRecover: (phrase: string, newPassword: string) => void;
	onBack: () => void;
}

export function RecoverScreen({ syncBound, busy, error, onRecover, onBack }: RecoverScreenProps) {
	const { t } = useTranslation();
	const [phrase, setPhrase] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [mismatch, setMismatch] = useState(false);
	return (
		<VaultCard title={t("vault.recoverTitle")}>
			<p className="text-muted-foreground">{t("vault.recoverIntro")}</p>
			{syncBound && <p className="text-xs text-muted-foreground">{t("vault.recoverSyncHint")}</p>}
			<form
				className="flex flex-col gap-3"
				onSubmit={(e) => {
					e.preventDefault();
					if (password !== confirm) {
						setMismatch(true);
						return;
					}
					onRecover(phrase, password);
				}}
			>
				<label className="flex flex-col gap-1.5" htmlFor="vault-recover-phrase">
					{t("vault.recoveryPhrase")}
					<textarea id="vault-recover-phrase" rows={3} autoComplete="off" spellCheck={false}
						className="rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
						value={phrase} onChange={(e) => setPhrase(e.target.value)} />
				</label>
				<label className="flex flex-col gap-1.5" htmlFor="vault-recover-password">
					{t("vault.newPassword")}
					<Input id="vault-recover-password" type="password" autoComplete="new-password" value={password}
						onChange={(e) => { setPassword(e.target.value); setMismatch(false); }} />
				</label>
				<label className="flex flex-col gap-1.5" htmlFor="vault-recover-confirm">
					{t("vault.confirmPassword")}
					<Input id="vault-recover-confirm" type="password" autoComplete="new-password" value={confirm}
						onChange={(e) => { setConfirm(e.target.value); setMismatch(false); }} />
				</label>
				{mismatch && <p className="text-xs text-destructive">{t("vault.mismatch")}</p>}
				{error && <p className="text-xs text-destructive">{error}</p>}
				<Button type="submit" disabled={busy || phrase.trim() === "" || password === ""}>
					{busy ? t("vault.unlocking") : t("vault.recover")}
				</Button>
			</form>
			<Button type="button" variant="ghost" size="sm" onClick={onBack}>
				{t("vault.back")}
			</Button>
		</VaultCard>
	);
}
```

- [ ] **Step 6: Implement `VaultGate`**

`src/components/vault/VaultGate.tsx`:

```tsx
import { type ReactNode, useEffect, useReducer, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { RecoveryPhraseStep } from "@/components/sync/RecoveryPhraseStep";
import { isVaultError, tauriVaultApi, type VaultApi, type VaultStatus } from "@/vault";
import { RecoverScreen } from "./RecoverScreen";
import { SetupScreen } from "./SetupScreen";
import { UnlockScreen } from "./UnlockScreen";
import { VaultCard, vaultErrorMessage } from "./VaultMessage";

type Screen =
	| { kind: "loading" }
	| { kind: "status"; status: VaultStatus; recovering: boolean }
	| { kind: "phrase"; phrase: string }
	| { kind: "retry-keychain"; message: string }
	| { kind: "open" };

type State = { screen: Screen; busy: boolean; error: string | null };

type Action =
	| { type: "status"; status: VaultStatus }
	| { type: "busy" }
	| { type: "failed"; message: string }
	| { type: "keychain-failed"; message: string }
	| { type: "phrase"; phrase: string }
	| { type: "recovering"; value: boolean }
	| { type: "open" };

function reducer(state: State, action: Action): State {
	switch (action.type) {
		case "status":
			return { screen: { kind: "status", status: action.status, recovering: false }, busy: false, error: null };
		case "busy":
			return { ...state, busy: true, error: null };
		case "failed":
			return { ...state, busy: false, error: action.message };
		case "keychain-failed":
			return { screen: { kind: "retry-keychain", message: action.message }, busy: false, error: null };
		case "phrase":
			return { screen: { kind: "phrase", phrase: action.phrase }, busy: false, error: null };
		case "recovering":
			return state.screen.kind === "status"
				? { ...state, screen: { ...state.screen, recovering: action.value }, error: null }
				: state;
		case "open":
			return { screen: { kind: "open" }, busy: false, error: null };
	}
}

interface VaultGateProps {
	api?: VaultApi;
	children: ReactNode;
	random?: () => number;
}

/**
 * Rendered instead of the app, not over it: nothing that reads the database
 * is mounted until Rust has registered the decrypted pool.
 */
export function VaultGate({ api = tauriVaultApi, children, random }: VaultGateProps) {
	const { t } = useTranslation();
	const [state, dispatch] = useReducer(reducer, { screen: { kind: "loading" }, busy: false, error: null });
	// StrictMode runs effects twice in dev; the keychain unlock must start once.
	const started = useRef(false);

	async function run(action: () => Promise<void>) {
		dispatch({ type: "busy" });
		try {
			await action();
			dispatch({ type: "open" });
		} catch (e) {
			dispatch({ type: "failed", message: vaultErrorMessage(t, e) });
		}
	}

	async function unlockKeychain() {
		try {
			await api.unlockKeychain();
			dispatch({ type: "open" });
		} catch (e) {
			if (isVaultError(e) && e.code === "key-missing") {
				dispatch({ type: "status", status: { state: "broken", migrating: false, syncBound: false, brokenReason: null } });
				dispatch({ type: "failed", message: vaultErrorMessage(t, e) });
				return;
			}
			dispatch({ type: "keychain-failed", message: vaultErrorMessage(t, e) });
		}
	}

	// oxlint-disable-next-line react-doctor/no-set-state-after-await-in-effect -- dispatch is guarded by the started ref and the gate never unmounts before it resolves
	useEffect(() => {
		if (started.current) return;
		started.current = true;
		void api.status().then((status) => {
			dispatch({ type: "status", status });
			if (status.state === "keychain") void unlockKeychain();
		});
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	const { screen, busy, error } = state;
	if (screen.kind === "open") return <>{children}</>;
	if (screen.kind === "loading") return <div className="min-h-screen bg-background" />;

	if (screen.kind === "phrase") {
		return (
			<VaultCard title={t("vault.setupTitle")}>
				<RecoveryPhraseStep phrase={screen.phrase} random={random} onConfirmed={() => dispatch({ type: "open" })} />
			</VaultCard>
		);
	}

	if (screen.kind === "retry-keychain") {
		return (
			<VaultCard title={t("vault.unlockTitle")}>
				<p className="text-destructive">{screen.message}</p>
				<Button type="button" onClick={() => void unlockKeychain()}>
					{t("vault.retry")}
				</Button>
			</VaultCard>
		);
	}

	const { status, recovering } = screen;
	switch (status.state) {
		case "fresh":
		case "legacy-plaintext":
			return (
				<SetupScreen
					legacy={status.state === "legacy-plaintext"}
					busy={busy}
					error={error}
					onNoPassword={() => void run(() => api.setupKeychain())}
					onPassword={(password) => {
						dispatch({ type: "busy" });
						api.setupPassword(password).then(
							(phrase) => dispatch({ type: "phrase", phrase }),
							(e) => dispatch({ type: "failed", message: vaultErrorMessage(t, e) }),
						);
					}}
				/>
			);
		case "password":
			return recovering ? (
				<RecoverScreen
					syncBound={status.syncBound}
					busy={busy}
					error={error}
					onBack={() => dispatch({ type: "recovering", value: false })}
					onRecover={(phrase, pw) => void run(() => api.unlockRecovery(phrase, pw))}
				/>
			) : (
				<UnlockScreen
					busy={busy}
					error={error}
					onForgot={() => dispatch({ type: "recovering", value: true })}
					onUnlock={(pw) => void run(() => api.unlockPassword(pw))}
				/>
			);
		case "keychain":
			return <div className="min-h-screen bg-background" />;
		case "broken":
			return (
				<VaultCard title={t("vault.brokenTitle")}>
					<p className="text-destructive">
						{error ??
							(status.brokenReason === "vault-missing"
								? t("vault.brokenVaultMissing")
								: t("vault.brokenCorrupt"))}
					</p>
				</VaultCard>
			);
	}
}
```

- [ ] **Step 7: Run the gate tests**

Run: `pnpm vitest run src/components/vault`
Expected: 11 passed. If `RecoveryPhraseStep`'s confirmation needs specific input to finish, the test that checks "opens only once confirmed" only asserts the phrase is shown and the app is not — keep it that way.

- [ ] **Step 8: Put the gate in front of the app**

In `src/App.tsx`:
- Rename the existing `export default function App()` to `function AppBoot()`; in its final `return`, drop the `<ThemeProvider>` wrapper (return `<AppContent />` directly).
- In `AppBoot`'s `init`, right after `setSyncContext({...})` and before `startSync()`, unlock sync from the cached DEK:

```ts
				// The sync vault opens from the DEK sealed in this (now decrypted)
				// database — no server round trip, no second password prompt.
				const [localDek, userId] = await Promise.all([
					getSyncState(driver, "local_dek"),
					getSyncState(driver, "user_id"),
				]);
				if (localDek && userId) {
					await unlockSync(localDek, userId).catch(() => {
						// A stale blob leaves sync on "locked", where the existing
						// unlock dialog still works; the app itself stays usable.
					});
				}
```

  with imports `import { getSyncState } from "@/sync/state";` and `import { unlockSync } from "@/vault";`. (`"local_dek"` becomes a valid `SyncStateKey` in Task 10, Step 3 — do that one-line change now if the type check complains.)
- Add the new default export:

```tsx
export default function App() {
	return (
		<ThemeProvider>
			<VaultGate>
				<AppBoot />
			</VaultGate>
		</ThemeProvider>
	);
}
```

  with `import { VaultGate } from "@/components/vault/VaultGate";`.

- [ ] **Step 9: Verify**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: no type errors; the full suite passes.

Manual: `pnpm tauri dev` (or rebuild the debug binary and launch with a scratch `HOME`, as in the testing setup). On an existing plaintext `usagi.db`: the setup screen shows the legacy notice; choose a password; confirm the recovery key; the app opens with all tasks. Then:

```bash
sqlite3 "$HOME/Library/Application Support/com.bunly.app/usagi.db" .tables
```

Expected: `Error: file is not a database`. Relaunch: the unlock screen appears.

- [ ] **Step 10: Checkpoint** — no commit.

---

### Task 10: Bind the sync account to the vault

**Files:**
- Modify: `src/sync/state.ts` (`SyncStateKey` gets `"local_dek"`)
- Modify: `src/sync/auth.ts` (`VaultPort.bindAccount`, `persistSession`, `signIn`, `register`, `SIGNED_OUT_KEYS`)
- Modify: `src/components/sync/sync-panel-deps.ts` (`signOut` → `unbindAccount`)
- Test: `src/sync/auth.test.ts`, `src/components/sync/sync-panel-deps.test.ts`

**Interfaces:**
- Consumes: `bindAccount`, `unbindAccount` (Task 8).
- Produces: `VaultPort` gains `bindAccount(wrappedDekRecovery: string): Promise<string>`; sign-in and registration persist `local_dek`.

- [ ] **Step 1: Write the failing tests**

In `src/sync/auth.test.ts`:

1. The `vault` object of `describe("signIn")` gains `bindAccount: vi.fn(async () => "sealed-local-dek"),`.
2. The `VaultPort` literal in `describe("register")` gains `async bindAccount() { return "sealed-local-dek"; },`.
3. In the existing test "runs prelogin → login → keys → completeUnlock and persists the session", append after the `server_url` assertion:

```ts
		// The keys response's recovery wrapping ("r") goes to the vault, strictly
		// after completeUnlock: bind consumes what completeUnlock left behind.
		expect(vault.bindAccount).toHaveBeenCalledWith("r");
		expect(vault.completeUnlock.mock.invocationCallOrder[0]).toBeLessThan(
			vault.bindAccount.mock.invocationCallOrder[0],
		);
		expect(await getSyncState(driver, "local_dek")).toBe("sealed-local-dek");
```

4. In the existing register test, change the literal's `bindAccount` to record its argument and assert on it — replace step 2's line with:

```ts
			async bindAccount(wrappedDekRecovery) {
				boundWith = wrappedDekRecovery;
				return "sealed-local-dek";
			},
```

declare `let boundWith: string | null = null;` next to `let pendingSalt`, and append to the test's assertions:

```ts
		expect(boundWith).toBe("wrapped-dek-recovery");
		expect(await getSyncState(driver, "local_dek")).toBe("sealed-local-dek");
```

5. Add a sign-out test at the end of the file:

```ts
describe("signOut", () => {
	it("forgets the sealed DEK with the rest of the session", async () => {
		await setSyncState(driver, "refresh_token", "rt");
		await setSyncState(driver, "local_dek", "sealed-local-dek");
		const { fetchImpl } = fakeServer({ "/v1/auth/logout": () => json(204, {}) });
		await signOut({ db: driver, fetchImpl, baseUrl: "https://sync.example" });
		expect(await getSyncState(driver, "local_dek")).toBeNull();
	});
});
```

If a `describe("signOut")` already exists in the file, add the `it` to it instead.

In `src/components/sync/sync-panel-deps.test.ts`, extend the `@/crypto`-style mocks with a mock of `@/vault` whose `unbindAccount` pushes `"unbindAccount"` into `h.calls`, then update the sign-out expectation:

```ts
		expect(h.calls).toEqual(["stopSync", "lock", "signOutAccount", "unbindAccount"]);
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/sync/auth.test.ts src/components/sync/sync-panel-deps.test.ts`
Expected: the new tests fail (`bindAccount` never called, `local_dek` null, `unbindAccount` missing).

- [ ] **Step 3: Implement**

`src/sync/state.ts`: add `| "local_dek"` to `SyncStateKey`, with a one-line comment: `// The account DEK sealed under the local database key (vault_bind_account).`

`src/sync/auth.ts`:
- `VaultPort` gains `bindAccount(wrappedDekRecovery: string): Promise<string>;` and `tauriVault` gets `bindAccount` imported from `@/vault`.
- `persistSession` takes a `localDek: string` parameter and adds `await setSyncState(db, "local_dek", localDek);`.
- In `signIn`, after `completeUnlock`: `const localDek = await deps.vault.bindAccount(keys.wrappedDekRecovery);` and pass it to `persistSession`.
- In `register`, after `completeUnlock`: `const localDek = await deps.vault.bindAccount(material.wrappedDekRecovery);` and pass it to `persistSession`.
- Add `"local_dek"` to `SIGNED_OUT_KEYS`.

`src/components/sync/sync-panel-deps.ts`, in `signOut`, after `await signOutAccount(...)` and before `detach()`:

```ts
			// The data stays encrypted; only the account's way in to it goes.
			await unbindAccount();
```

with `import { unbindAccount } from "@/vault";`.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run src/sync src/components/sync`
Expected: all pass.

- [ ] **Step 5: Checkpoint** — no commit.

---

### Task 11: Settings › Security tab

**Files:**
- Modify: `src/types/settings-tab.ts` (add `"security"` after `"sync"`)
- Create: `src/components/vault/SecurityPanel.tsx`
- Test: `src/components/vault/SecurityPanel.test.tsx`
- Modify: `src/components/layout/SettingsDialog.tsx` (tab button + panel)
- Modify: `src/i18n/locales/en.ts`, `fr.ts` (`settings.tabSecurity`, `vault.security*`)

**Interfaces:**
- Consumes: `VaultApi` (Task 8), `RecoveryPhraseStep`.
- Produces: `export function SecurityPanel({ api, onDismissBlockedChange, random }: { api?: VaultApi; onDismissBlockedChange?: (blocked: boolean) => void; random?: () => number })`.

- [ ] **Step 1: Add the strings**

`en.ts`: in `settings`, `tabSecurity: "Security",`. In `vault`:

```ts
		securityKeychain:
			"No password: this device's keychain unlocks Bunly at startup.",
		securityPassword: "Bunly asks for your password at startup.",
		securitySynced:
			"Your password is your sync account's. A synced device always asks for it.",
		setPassword: "Set a password",
		changePassword: "Change password",
		removePassword: "Remove password",
		currentPassword: "Current password",
		save: "Save",
		cancel: "Cancel",
		saved: "Saved.",
		accountPasswordLater:
			"Changing your sync account's password is not available yet.",
```

`fr.ts`: `tabSecurity: "Sécurité",` and:

```ts
		securityKeychain:
			"Pas de mot de passe : le trousseau de cet appareil déverrouille Bunly au démarrage.",
		securityPassword: "Bunly demande votre mot de passe au démarrage.",
		securitySynced:
			"Votre mot de passe est celui de votre compte de synchronisation. Un appareil synchronisé le demande toujours.",
		setPassword: "Définir un mot de passe",
		changePassword: "Changer le mot de passe",
		removePassword: "Supprimer le mot de passe",
		currentPassword: "Mot de passe actuel",
		save: "Enregistrer",
		cancel: "Annuler",
		saved: "Enregistré.",
		accountPasswordLater:
			"Le changement du mot de passe du compte de synchronisation n'est pas encore disponible.",
```

- [ ] **Step 2: Write the failing tests**

`src/components/vault/SecurityPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";
import type { VaultApi, VaultStatus } from "@/vault";
import { SecurityPanel } from "./SecurityPanel";

const PHRASE = Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(" ");
function api(status: Partial<VaultStatus>, over: Partial<VaultApi> = {}): VaultApi {
	return {
		status: vi.fn(async () => ({ state: "password", migrating: false, syncBound: false, brokenReason: null, ...status }) as VaultStatus),
		setupKeychain: vi.fn(), setupPassword: vi.fn(), unlockKeychain: vi.fn(),
		unlockPassword: vi.fn(), unlockRecovery: vi.fn(),
		setPassword: vi.fn(async () => PHRASE),
		changePassword: vi.fn(async () => {}),
		removePassword: vi.fn(async () => {}),
		...over,
	};
}
const button = (name: RegExp) => screen.findByRole("button", { name });

describe("SecurityPanel", () => {
	it("offers only 'set a password' in keychain mode", async () => {
		render(<SecurityPanel api={api({ state: "keychain" })} />);
		expect(await button(/set a password|définir un mot de passe/i)).toBeEnabled();
		expect(screen.queryByRole("button", { name: /remove|supprimer/i })).not.toBeInTheDocument();
	});

	it("sets a password, then shows the recovery key while blocking dismissal", async () => {
		const user = userEvent.setup();
		const a = api({ state: "keychain" });
		const blocked = vi.fn();
		render(<SecurityPanel api={a} onDismissBlockedChange={blocked} />);
		await user.click(await button(/set a password|définir un mot de passe/i));
		await user.type(screen.getByLabelText(/^new password$|^nouveau mot de passe$/i), "pw");
		await user.type(screen.getByLabelText(/confirm/i), "pw");
		await user.click(screen.getByRole("button", { name: /^save$|^enregistrer$/i }));
		expect(await screen.findByText("word24")).toBeInTheDocument();
		expect(a.setPassword).toHaveBeenCalledWith("pw");
		expect(blocked).toHaveBeenCalledWith(true);
	});

	it("changes and removes a local password", async () => {
		const user = userEvent.setup();
		const a = api({ state: "password" });
		render(<SecurityPanel api={a} />);
		await user.click(await button(/change password|changer le mot de passe/i));
		await user.type(screen.getByLabelText(/current|actuel/i), "old");
		await user.type(screen.getByLabelText(/^new password$|^nouveau mot de passe$/i), "new");
		await user.type(screen.getByLabelText(/confirm/i), "new");
		await user.click(screen.getByRole("button", { name: /^save$|^enregistrer$/i }));
		expect(a.changePassword).toHaveBeenCalledWith("old", "new");

		await user.click(await button(/remove password|supprimer le mot de passe/i));
		await user.type(screen.getByLabelText(/current|actuel/i), "new");
		await user.click(screen.getByRole("button", { name: /^save$|^enregistrer$/i }));
		expect(a.removePassword).toHaveBeenCalledWith("new");
	});

	it("reports a wrong current password", async () => {
		const user = userEvent.setup();
		const a = api({ state: "password" }, { removePassword: vi.fn(async () => { throw { code: "wrong-secret" }; }) });
		render(<SecurityPanel api={a} />);
		await user.click(await button(/remove password|supprimer le mot de passe/i));
		await user.type(screen.getByLabelText(/current|actuel/i), "x");
		await user.click(screen.getByRole("button", { name: /^save$|^enregistrer$/i }));
		expect(await screen.findByText(/did not work|n'a pas fonctionné/i)).toBeInTheDocument();
	});

	it("disables both actions on a synced device and says why", async () => {
		render(<SecurityPanel api={api({ state: "password", syncBound: true })} />);
		expect(await button(/change password|changer le mot de passe/i)).toBeDisabled();
		expect(screen.getByRole("button", { name: /remove password|supprimer le mot de passe/i })).toBeDisabled();
		expect(screen.getByText(/always asks|le demande toujours/i)).toBeInTheDocument();
	});
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm vitest run src/components/vault/SecurityPanel.test.tsx`
Expected: FAIL, cannot resolve `./SecurityPanel`.

- [ ] **Step 4: Implement `SecurityPanel`**

`src/components/vault/SecurityPanel.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RecoveryPhraseStep } from "@/components/sync/RecoveryPhraseStep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tauriVaultApi, type VaultApi, type VaultStatus } from "@/vault";
import { vaultErrorMessage } from "./VaultMessage";

type Form = "set" | "change" | "remove" | null;

interface SecurityPanelProps {
	api?: VaultApi;
	/** Raised while a one-shot recovery key is on screen (see SettingsDialog). */
	onDismissBlockedChange?: (blocked: boolean) => void;
	random?: () => number;
}

export function SecurityPanel({ api = tauriVaultApi, onDismissBlockedChange, random }: SecurityPanelProps) {
	const { t } = useTranslation();
	const [status, setStatus] = useState<VaultStatus | null>(null);
	const [form, setForm] = useState<Form>(null);
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [phrase, setPhrase] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		api.status().then((s) => {
			if (!cancelled) setStatus(s);
		});
		return () => {
			cancelled = true;
		};
	}, [api]);

	function open(which: Form) {
		setForm(which);
		setCurrent("");
		setNext("");
		setConfirm("");
		setError(null);
	}

	async function submit(e: { preventDefault(): void }) {
		e.preventDefault();
		if (form !== "remove" && next !== confirm) {
			setError(t("vault.mismatch"));
			return;
		}
		setBusy(true);
		setError(null);
		try {
			if (form === "set") {
				const words = await api.setPassword(next);
				setPhrase(words);
				onDismissBlockedChange?.(true);
			} else if (form === "change") {
				await api.changePassword(current, next);
			} else if (form === "remove") {
				await api.removePassword(current);
			}
			setForm(null);
			setStatus(await api.status());
		} catch (err) {
			setError(vaultErrorMessage(t, err));
		} finally {
			setBusy(false);
		}
	}

	if (!status) return <div className="py-4" role="tabpanel" />;

	if (phrase) {
		return (
			<div className="py-4" role="tabpanel">
				<RecoveryPhraseStep
					phrase={phrase}
					random={random}
					onConfirmed={() => {
						setPhrase(null);
						onDismissBlockedChange?.(false);
					}}
				/>
			</div>
		);
	}

	const keychain = status.state === "keychain";
	const locked = status.syncBound;

	return (
		<div className="flex flex-col gap-4 py-4" role="tabpanel">
			<p className="text-sm">
				{keychain ? t("vault.securityKeychain") : locked ? t("vault.securitySynced") : t("vault.securityPassword")}
			</p>
			{locked && <p className="text-xs text-muted-foreground">{t("vault.accountPasswordLater")}</p>}

			<div className="flex flex-wrap gap-2">
				{keychain ? (
					<Button type="button" variant="outline" onClick={() => open("set")}>
						{t("vault.setPassword")}
					</Button>
				) : (
					<>
						<Button type="button" variant="outline" disabled={locked} onClick={() => open("change")}>
							{t("vault.changePassword")}
						</Button>
						<Button type="button" variant="outline" disabled={locked} onClick={() => open("remove")}>
							{t("vault.removePassword")}
						</Button>
					</>
				)}
			</div>

			{form && (
				<form onSubmit={submit} className="flex max-w-sm flex-col gap-3 border-t border-border pt-4">
					{form !== "set" && (
						<label className="flex flex-col gap-1.5 text-sm" htmlFor="security-current">
							{t("vault.currentPassword")}
							<Input id="security-current" type="password" autoComplete="current-password"
								value={current} onChange={(e) => setCurrent(e.target.value)} />
						</label>
					)}
					{form !== "remove" && (
						<>
							<label className="flex flex-col gap-1.5 text-sm" htmlFor="security-new">
								{t("vault.newPassword")}
								<Input id="security-new" type="password" autoComplete="new-password"
									value={next} onChange={(e) => setNext(e.target.value)} />
							</label>
							<label className="flex flex-col gap-1.5 text-sm" htmlFor="security-confirm">
								{t("vault.confirmPassword")}
								<Input id="security-confirm" type="password" autoComplete="new-password"
									value={confirm} onChange={(e) => setConfirm(e.target.value)} />
							</label>
						</>
					)}
					{form === "remove" && <p className="text-xs text-muted-foreground">{t("vault.noPasswordHint")}</p>}
					{error && <p className="text-xs text-destructive">{error}</p>}
					<div className="flex gap-2">
						<Button type="submit" disabled={busy}>{t("vault.save")}</Button>
						<Button type="button" variant="ghost" onClick={() => setForm(null)}>{t("vault.cancel")}</Button>
					</div>
				</form>
			)}
		</div>
	);
}
```

- [ ] **Step 5: Mount it in `SettingsDialog`**

In `src/types/settings-tab.ts`, insert `"security",` after `"sync",`.

In `src/components/layout/SettingsDialog.tsx`:
- add `["security", t("settings.tabSecurity")],` after the `["sync", …]` entry of the tab list;
- add, after the `activeTab === "sync"` block:

```tsx
					{activeTab === "security" && (
						<SecurityPanel onDismissBlockedChange={setDismissBlocked} />
					)}
```

  with `import { SecurityPanel } from "@/components/vault/SecurityPanel";`.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/components/vault src/components/layout`
Expected: all pass. If an existing SettingsDialog test counts tabs, update its expected list to include Security.

- [ ] **Step 7: Checkpoint** — no commit.

---

### Task 12: Encrypted automatic backups and import

**Files:**
- Modify: `src/components/layout/AppShell.tsx` (`writeAutomaticBackup`)
- Modify: `src/components/layout/SettingsDialog.tsx` (`handleImportPick`, export warning)
- Create: `src/lib/backup-file.ts`
- Test: `src/lib/backup-file.test.ts`
- Modify: `src/i18n/locales/en.ts`, `fr.ts` (`data.exportPlaintextWarning`)

**Interfaces:**
- Consumes: `sealBackup`, `openBackup` (Task 8).
- Produces: `src/lib/backup-file.ts` — `export const SEALED_BACKUP_EXTENSION = "bunlybak";` `export function automaticBackupName(now: Date): string;` `export async function readBackupText(path: string, raw: string, open: (blob: string) => Promise<string>): Promise<string>`.

- [ ] **Step 1: Write the failing tests**

`src/lib/backup-file.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { automaticBackupName, readBackupText } from "./backup-file";

describe("backup files", () => {
	it("names automatic backups with the sealed extension", () => {
		expect(automaticBackupName(new Date("2026-09-28T10:11:12.345Z"))).toBe(
			"bunly-before-replace-2026-09-28T10-11-12.bunlybak",
		);
	});

	it("opens a sealed backup through the vault", async () => {
		const open = vi.fn(async () => '{"version":1}');
		await expect(readBackupText("/x/a.bunlybak", "blob", open)).resolves.toBe('{"version":1}');
		expect(open).toHaveBeenCalledWith("blob");
	});

	it("passes a plain JSON export through untouched", async () => {
		const open = vi.fn();
		await expect(readBackupText("/x/a.json", "{}", open)).resolves.toBe("{}");
		expect(open).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/lib/backup-file.test.ts`
Expected: FAIL, cannot resolve `./backup-file`.

- [ ] **Step 3: Implement**

`src/lib/backup-file.ts`:

```ts
export const SEALED_BACKUP_EXTENSION = "bunlybak";

/** Same stamp format the plaintext backups used, so they sort together. */
export function automaticBackupName(now: Date): string {
	const stamp = now.toISOString().slice(0, 19).replace(/:/g, "-");
	return `bunly-before-replace-${stamp}.${SEALED_BACKUP_EXTENSION}`;
}

/** A sealed backup only opens with this install's database key, in Rust. */
export async function readBackupText(
	path: string,
	raw: string,
	open: (blob: string) => Promise<string>,
): Promise<string> {
	return path.endsWith(`.${SEALED_BACKUP_EXTENSION}`) ? open(raw) : raw;
}
```

In `src/components/layout/AppShell.tsx`, replace the body of `writeAutomaticBackup` after `exportData(...)`:

```ts
	const dir = await appConfigDir();
	// Sealed in Rust under the database key: a plaintext copy beside the
	// encrypted database would undo the encryption.
	await writeTextFile(
		await join(dir, automaticBackupName(new Date())),
		await sealBackup(JSON.stringify(data)),
	);
```

and update its comment (the `app_config_dir` rationale stays; drop the "stamp" line). Imports: `automaticBackupName` from `@/lib/backup-file`, `sealBackup` from `@/vault`.

In `SettingsDialog.tsx` `handleImportPick`:
- the `open({...})` filters become `[{ name: "Bunly", extensions: ["json", SEALED_BACKUP_EXTENSION] }]`;
- replace `const raw = await readTextFile(path);` with `const raw = await readBackupText(path, await readTextFile(path), openBackup);`.

Under the export button, add `<p className="text-xs text-muted-foreground">{t("data.exportPlaintextWarning")}</p>`.

Strings — `en.ts` `data`: `exportPlaintextWarning: "Exported files are not encrypted. Keep them somewhere safe.",`; `fr.ts` `data`: `exportPlaintextWarning: "Les fichiers exportés ne sont pas chiffrés. Rangez-les en lieu sûr.",`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/backup-file.test.ts src/components/layout`
Expected: all pass.

- [ ] **Step 5: Checkpoint** — no commit.

---

### Task 13: Finish (changelog, full verification, project checks)

**Files:**
- Modify: `src/assets/changelog.json`

- [ ] **Step 1: Changelog**

In the `Unreleased` section, `features`, add first:

```json
{
	"en": "Your data is now encrypted on your device. On first launch, choose a password — with a 24-word recovery key in case you forget it — or let your computer's keychain unlock Bunly for you. You can add, change or remove the password later under Settings › Security. A device connected to sync always asks for your account password at startup.",
	"fr": "Vos données sont désormais chiffrées sur votre appareil. Au premier lancement, choisissez un mot de passe — avec une clé de récupération de 24 mots en cas d'oubli — ou laissez le trousseau de votre ordinateur déverrouiller Bunly pour vous. Vous pouvez ajouter, changer ou supprimer le mot de passe plus tard dans Réglages › Sécurité. Un appareil connecté à la synchronisation demande toujours le mot de passe du compte au démarrage."
}
```

- [ ] **Step 2: Full automated verification**

Run: `cd src-tauri && cargo test && cargo clippy -- -D warnings` then `cd .. && pnpm tsc --noEmit && pnpm vitest run && pnpm test:e2e`
Expected: everything green (e2e is unaffected: the harness mounts `AppContent` directly).

- [ ] **Step 3: Manual end-to-end pass** (debug binary, scratch `HOME` per instance)

1. Fresh `HOME` → setup screen → "Continue without a password" → app opens; relaunch → opens with no prompt.
2. Settings › Security → set a password → recovery key shown, dialog can't be dismissed until confirmed; relaunch → unlock screen; wrong password → message; right password → app.
3. "Forgot your password?" → recovery key + new password → app; relaunch → new password works.
4. Sign in to the local sync server → relaunch → **account** password unlocks and sync status is not "locked" with the server stopped (offline unlock).
5. Sign out → Security tab → remove password is enabled again.
6. A `HOME` holding a plaintext `usagi.db` with tasks → legacy notice → migration → all tasks present; `sqlite3 usagi.db .tables` → `file is not a database`; no `usagi.db.plain`/`.enc` left.

- [ ] **Step 4: Project end-of-task checks (CLAUDE.md)**

```bash
source ~/.nvm/nvm.sh && nvm use 22.22.2 && rm -rf ~/.npm/_npx && npx -y react-doctor@latest --verbose --scope changed
```

Fix only diagnostics introduced by this work. Then:

```bash
pnpm run lint:fix
```

- [ ] **Step 5: Hand back** — summarize for the user; they commit.
