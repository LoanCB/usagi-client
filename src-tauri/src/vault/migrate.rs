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

fn sidecars(path: &Path) -> [PathBuf; 3] {
    let s = path.as_os_str().to_string_lossy();
    [
        PathBuf::from(format!("{s}-wal")),
        PathBuf::from(format!("{s}-shm")),
        PathBuf::from(format!("{s}-journal")),
    ]
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

// create_if_missing is required: ATTACH inherits the connection's open flags,
// so without it the encrypted export file could not be created. Every caller
// checks that the plaintext file exists first.
async fn plain_pool(path: &Path) -> Result<SqlitePool, VaultError> {
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(path)
                .create_if_missing(true),
        )
        .await
        .map_err(failed)
}

/// `sqlcipher_export` is SQLCipher's own plaintext → encrypted path: it
/// recreates the schema and copies every row inside the engine, so no type is
/// lost to a round trip through JS.
async fn export_encrypted(plain: &Path, enc: &Path, ldk: &[u8; 32]) -> Result<(), VaultError> {
    remove_with_sidecars(enc)?;
    let pool = plain_pool(plain).await?;
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&pool)
        .await
        .map_err(failed)?;
    let version: i64 = sqlx::query_scalar("PRAGMA user_version")
        .fetch_one(&pool)
        .await
        .map_err(failed)?;
    let enc_path = enc.to_string_lossy().replace('\'', "''");
    sqlx::query(&format!(
        "ATTACH DATABASE '{enc_path}' AS enc KEY {}",
        key_pragma(ldk)
    ))
    .execute(&pool)
    .await
    .map_err(failed)?;
    sqlx::query("SELECT sqlcipher_export('enc')")
        .execute(&pool)
        .await
        .map_err(failed)?;
    sqlx::query(&format!("PRAGMA enc.user_version = {version}"))
        .execute(&pool)
        .await
        .map_err(failed)?;
    sqlx::query("DETACH DATABASE enc")
        .execute(&pool)
        .await
        .map_err(failed)?;
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
        let n: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM \"{}\"",
            name.replace('"', "\"\"")
        ))
        .fetch_one(pool)
        .await
        .map_err(failed)?;
        out.push((name, n));
    }
    Ok(out)
}

async fn verify(plain: &Path, enc: &Path, ldk: &[u8; 32]) -> Result<(), VaultError> {
    let encrypted = build_pool(enc, ldk).await.map_err(failed)?;
    let check: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&encrypted)
        .await
        .map_err(failed)?;
    if check != "ok" {
        return Err(failed(format!("integrity_check: {check}")));
    }
    let source = plain_pool(plain).await?;
    let (a, b) = (
        table_counts(&source).await?,
        table_counts(&encrypted).await?,
    );
    source.close().await;
    encrypted.close().await;
    if a != b {
        return Err(failed("row counts differ after export"));
    }
    Ok(())
}

/// Removes the plaintext `-wal`/`-shm`/`-journal` before the swap. They must be
/// gone, or SQLite would treat them as the journal of the encrypted file that
/// takes over the name. A non-empty WAL means committed data was never
/// checkpointed (someone else had the file open), so refuse to swap.
fn remove_plain_sidecars(db: &Path) -> Result<(), VaultError> {
    let [wal, ..] = sidecars(db);
    match fs::metadata(&wal) {
        Ok(m) if m.len() > 0 => return Err(failed("plaintext WAL is not empty")),
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.into()),
    }
    for p in sidecars(db) {
        match fs::remove_file(&p) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(())
}

/// Moves `usagi.db.plain` aside under a timestamped name instead of deleting it.
fn preserve_plain(dir: &Path, plain: &Path) -> Result<(), VaultError> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    fs::rename(plain, dir.join(format!("{PLAIN_FILE}-{ts}")))?;
    Ok(())
}

/// An empty file would "open" as a brand-new database, so it proves nothing.
async fn opens_with(db: &Path, ldk: &[u8; 32]) -> bool {
    if fs::metadata(db).map_or(true, |m| m.len() == 0) {
        return false;
    }
    let Ok(pool) = build_pool(db, ldk).await else {
        return false;
    };
    let ok = sqlx::query_scalar::<_, i64>("SELECT count(*) FROM sqlite_master")
        .fetch_one(&pool)
        .await
        .is_ok();
    pool.close().await;
    ok
}

/// Every step is idempotent and the files on disk say which step was reached,
/// so a process killed anywhere in here finishes the job on the next launch.
///
/// Precondition: no pool or connection on `usagi.db` is open (call this before
/// the app opens its own pool), otherwise the checkpoint and file swap are unsafe.
pub async fn migrate(dir: &Path, ldk: &[u8; 32]) -> Result<(), VaultError> {
    let db = dir.join(DB_FILE);
    let enc = dir.join(ENC_FILE);
    let plain = dir.join(PLAIN_FILE);

    if plain.exists() {
        // The swap had started. Never decide from presence alone: the plaintext
        // may be the only copy of the data.
        if enc.exists() {
            // The encrypted copy was verified before the swap began, and wins
            // over whatever was recreated at usagi.db in the meantime.
            remove_with_sidecars(&db)?;
            fs::rename(&enc, &db)?;
            remove_with_sidecars(&plain)?;
        } else if !db.exists() {
            fs::rename(&plain, &db)?;
        } else if is_plaintext_sqlite(&db)? {
            preserve_plain(dir, &plain)?;
        } else if opens_with(&db, ldk).await {
            remove_with_sidecars(&plain)?;
        } else {
            // Neither plaintext nor our encrypted database: the plaintext may be
            // the only copy of the data left.
            preserve_plain(dir, &plain)?;
            return Err(failed("usagi.db does not open with the vault key"));
        }
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
    remove_plain_sidecars(&db)?;
    fs::rename(&db, &plain)?;
    fs::rename(&enc, &db)?;
    remove_with_sidecars(&plain)
}

pub fn encrypt_legacy_backups(dir: &Path, ldk: &[u8; 32]) -> Result<(), VaultError> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !(name.starts_with(BACKUP_PREFIX) && name.ends_with(".json")) {
            continue;
        }
        let sealed = seal_backup(ldk, &fs::read(&path)?);
        let target = path.with_extension("bunlybak");
        // Atomic write: the source JSON is only deleted once the sealed copy is durable.
        let tmp = path.with_extension("bunlybak.tmp");
        let mut f = fs::File::create(&tmp)?;
        std::io::Write::write_all(&mut f, sealed.as_bytes())?;
        f.sync_all()?;
        drop(f);
        fs::rename(&tmp, &target)?;
        fs::remove_file(&path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use sqlx::SqlitePool;

    const LDK: [u8; 32] = [5u8; 32];

    async fn plain_pool(path: &Path) -> SqlitePool {
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(path)
                    .create_if_missing(true)
                    .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal),
            )
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
        sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
            .fetch_one(pool)
            .await
            .unwrap()
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
        let v: i64 = sqlx::query_scalar("PRAGMA user_version")
            .fetch_one(&pool)
            .await
            .unwrap();
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
        export_encrypted(&dir.path().join(DB_FILE), &dir.path().join(ENC_FILE), &LDK)
            .await
            .unwrap();
        let err = verify(
            &dir.path().join(DB_FILE),
            &dir.path().join(ENC_FILE),
            &[6u8; 32],
        )
        .await
        .unwrap_err();
        assert!(matches!(err, VaultError::MigrationFailed(_)));
        assert!(is_plaintext_sqlite(&dir.path().join(DB_FILE)).unwrap());
        let pool = plain_pool(&dir.path().join(DB_FILE)).await;
        assert_eq!(count(&pool, "tasks").await, 2);
    }

    #[test]
    fn legacy_backups_are_encrypted_and_the_plaintext_removed() {
        let dir = tempfile::tempdir().unwrap();
        let json = dir
            .path()
            .join("bunly-before-replace-2026-09-01T10-00-00.json");
        std::fs::write(&json, br#"{"version":1,"tasks":[]}"#).unwrap();
        std::fs::write(dir.path().join("unrelated.json"), b"{}").unwrap();

        encrypt_legacy_backups(dir.path(), &LDK).unwrap();

        assert!(!json.exists());
        let sealed = dir
            .path()
            .join("bunly-before-replace-2026-09-01T10-00-00.bunlybak");
        let blob = std::fs::read_to_string(&sealed).unwrap();
        assert_eq!(
            super::super::keys::open_backup(&LDK, &blob).unwrap(),
            br#"{"version":1,"tasks":[]}"#
        );
        assert!(dir.path().join("unrelated.json").exists());
    }

    async fn seed_encrypted_empty(path: &Path) {
        let pool = build_pool(path, &LDK).await.unwrap();
        sqlx::query("CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT)")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;
    }

    fn stash_plain_as(dir: &Path) {
        // Turns a freshly seeded plaintext usagi.db into usagi.db.plain.
        for suffix in ["", "-wal", "-shm"] {
            let from = dir.join(format!("{DB_FILE}{suffix}"));
            if from.exists() {
                std::fs::rename(from, dir.join(format!("{PLAIN_FILE}{suffix}"))).unwrap();
            }
        }
    }

    #[tokio::test]
    async fn plain_plus_recreated_db_plus_enc_keeps_the_verified_export() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        seed_plain(d).await;
        migrate(d, &LDK).await.unwrap();
        // State: db -> .plain done, an empty encrypted db was recreated at usagi.db.
        std::fs::rename(d.join(DB_FILE), d.join(ENC_FILE)).unwrap();
        std::fs::write(d.join(PLAIN_FILE), b"stale plaintext").unwrap();
        seed_encrypted_empty(&d.join(DB_FILE)).await;
        migrate(d, &LDK).await.unwrap();
        assert_migrated(d).await;
    }

    #[tokio::test]
    async fn plain_only_is_restored_and_migrated_not_deleted() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        seed_plain(d).await;
        stash_plain_as(d);
        migrate(d, &LDK).await.unwrap();
        assert_migrated(d).await;
    }

    #[tokio::test]
    async fn plain_plus_plaintext_db_preserves_the_plain_copy() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        seed_plain(d).await;
        std::fs::write(d.join(PLAIN_FILE), b"older copy").unwrap();
        migrate(d, &LDK).await.unwrap();
        assert!(!is_plaintext_sqlite(&d.join(DB_FILE)).unwrap());
        let kept: Vec<_> = std::fs::read_dir(d)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| {
                n.starts_with("usagi.db.plain-") && !n.ends_with("-wal") && !n.ends_with("-shm")
            })
            .collect();
        assert_eq!(kept.len(), 1, "{kept:?}");
        assert_eq!(std::fs::read(d.join(&kept[0])).unwrap(), b"older copy");
        assert!(!d.join(PLAIN_FILE).exists());
    }

    fn preserved_plain_copies(d: &Path) -> Vec<String> {
        std::fs::read_dir(d)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| {
                n.starts_with("usagi.db.plain-") && !n.ends_with("-wal") && !n.ends_with("-shm")
            })
            .collect()
    }

    async fn assert_plain_kept_when_db_is(db_bytes: &[u8]) {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        seed_plain(d).await;
        stash_plain_as(d);
        std::fs::write(d.join(DB_FILE), db_bytes).unwrap();

        let err = migrate(d, &LDK).await.unwrap_err();

        assert!(matches!(err, VaultError::MigrationFailed(_)), "{err:?}");
        let kept = preserved_plain_copies(d);
        assert_eq!(kept.len(), 1, "{kept:?}");
        assert!(is_plaintext_sqlite(&d.join(&kept[0])).unwrap());
        assert!(!d.join(PLAIN_FILE).exists());
    }

    #[tokio::test]
    async fn plain_plus_garbage_db_preserves_the_plain_copy() {
        assert_plain_kept_when_db_is(b"not a database, not plaintext either").await;
    }

    #[tokio::test]
    async fn plain_plus_empty_db_preserves_the_plain_copy() {
        assert_plain_kept_when_db_is(b"").await;
    }

    #[test]
    fn a_non_empty_plaintext_wal_blocks_the_swap() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join(DB_FILE);
        std::fs::write(&db, b"x").unwrap();
        std::fs::write(dir.path().join("usagi.db-wal"), b"unflushed").unwrap();
        assert!(matches!(
            remove_plain_sidecars(&db),
            Err(VaultError::MigrationFailed(_))
        ));
        assert!(dir.path().join("usagi.db-wal").exists());
    }

    #[test]
    fn a_sidecar_that_cannot_be_removed_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join(DB_FILE);
        // A directory named like the -shm file makes remove_file fail.
        std::fs::create_dir(dir.path().join("usagi.db-shm")).unwrap();
        assert!(remove_plain_sidecars(&db).is_err());
    }

    #[test]
    fn journal_sidecars_are_removed_too() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join(DB_FILE);
        std::fs::write(dir.path().join("usagi.db-journal"), b"").unwrap();
        remove_with_sidecars(&db).unwrap();
        assert!(!dir.path().join("usagi.db-journal").exists());
    }
}
