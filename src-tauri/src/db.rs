//! Registers the app's SQLite pool with tauri-plugin-sql, after the vault
//! commands (`vault::commands`) have unlocked the key.
//!
//! The plugin's own `load` command builds the pool with sqlx defaults, which
//! means up to 10 connections. That is incompatible with how the JS side
//! expresses a transaction: it has no transaction API to call, so it sends a
//! bare `BEGIN`, its statements, then `COMMIT` as separate commands. Each
//! command acquires a connection independently, so a multi-connection pool is
//! free to scatter them — a statement can land outside the transaction it
//! belongs to, and two logical transactions can be open at once. The sync
//! engine's §9.5 guarantee (a pull page applies as one unit) rests on this
//! file: with a single connection, "the pool's connection" and "the
//! transaction's connection" are the same thing by construction.
//!
//! The JS counterpart of the same guarantee is `ConnectionLock`
//! (`src/db/connection-lock.ts`): one connection makes the statements of a
//! transaction contiguous on the wire, the lock keeps anyone else's statements
//! from slipping between them.

use std::path::Path;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_sql::{DbInstances, DbPool};

/// The connection string the frontend passes to `Database.get`, and the key
/// the plugin looks the pool up under. Both sides must spell it the same way.
pub const DB_URL: &str = "sqlite:usagi.db";

/// The file name inside the app config dir, as `path_mapper` in
/// tauri-plugin-sql derives it from [`DB_URL`]. Kept identical so the pool
/// opens the database users already have rather than a fresh one beside it.
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

/// Open the pool and hand it to tauri-plugin-sql under [`DB_URL`], so the
/// frontend reaches it with `Database.get` instead of `Database.load` (which
/// would build a default, multi-connection pool and overwrite this one).
///
/// Called by the vault commands once the key is known, never at startup: until
/// then there is nothing the pool could decrypt. Blocks, so it must run on a
/// blocking thread (`spawn_blocking`), not inside an async command.
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

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Row;

    async fn scalar_count(pool: &SqlitePool) -> i64 {
        sqlx::query("SELECT COUNT(*) AS n FROM t")
            .fetch_one(pool)
            .await
            .expect("count")
            .get::<i64, _>("n")
    }

    /// The defect this module fixes, shown on the mechanism itself.
    ///
    /// It cannot be written against the JS driver: `BetterSqliteDriver` holds a
    /// single connection, so the interleaving below is unrepresentable there.
    #[tokio::test]
    async fn a_multi_connection_pool_loses_the_transaction() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("multi.db");
        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(&path)
                    .create_if_missing(true),
            )
            .await
            .expect("pool");
        sqlx::query("CREATE TABLE t (id TEXT PRIMARY KEY)")
            .execute(&pool)
            .await
            .expect("create");

        // Two commands in flight is all it takes: the plugin acquires a
        // connection per command, so nothing pins them to the same one.
        let mut engine = pool.acquire().await.expect("engine conn");
        let mut ui = pool.acquire().await.expect("ui conn");

        sqlx::query("BEGIN")
            .execute(&mut *engine)
            .await
            .expect("begin");
        sqlx::query("INSERT INTO t (id) VALUES ('inside-the-transaction')")
            .execute(&mut *ui)
            .await
            .expect("write that believes it is in the transaction");
        sqlx::query("ROLLBACK")
            .execute(&mut *engine)
            .await
            .expect("rollback");

        drop(engine);
        drop(ui);
        // The rollback undid nothing: the write was never in the transaction.
        assert_eq!(scalar_count(&pool).await, 1);
    }

    #[tokio::test]
    async fn the_app_pool_serves_one_connection() {
        let dir = tempfile::tempdir().expect("tempdir");
        let pool = build_pool(&dir.path().join("one.db"), &KEY)
            .await
            .expect("pool");
        let held = pool.acquire().await.expect("first conn");
        assert!(
            pool.try_acquire().is_none(),
            "a second connection would let statements of one transaction diverge"
        );
        drop(held);
    }

    /// The same interleaving as the first test, through the pool this module
    /// builds and the way the plugin actually issues statements.
    #[tokio::test]
    async fn a_rollback_undoes_every_statement_of_the_transaction() {
        let dir = tempfile::tempdir().expect("tempdir");
        let pool = build_pool(&dir.path().join("rollback.db"), &KEY)
            .await
            .expect("pool");
        sqlx::query("CREATE TABLE t (id TEXT PRIMARY KEY)")
            .execute(&pool)
            .await
            .expect("create");

        sqlx::query("BEGIN").execute(&pool).await.expect("begin");
        sqlx::query("INSERT INTO t (id) VALUES ('a')")
            .execute(&pool)
            .await
            .expect("insert");
        sqlx::query("ROLLBACK")
            .execute(&pool)
            .await
            .expect("rollback");

        assert_eq!(scalar_count(&pool).await, 0);
    }

    /// A transaction spread over several commands must survive being handed
    /// back to the pool between each one.
    #[tokio::test]
    async fn a_commit_keeps_every_statement_of_the_transaction() {
        let dir = tempfile::tempdir().expect("tempdir");
        let pool = build_pool(&dir.path().join("commit.db"), &KEY)
            .await
            .expect("pool");
        sqlx::query("CREATE TABLE t (id TEXT PRIMARY KEY)")
            .execute(&pool)
            .await
            .expect("create");

        sqlx::query("BEGIN").execute(&pool).await.expect("begin");
        sqlx::query("INSERT INTO t (id) VALUES ('a')")
            .execute(&pool)
            .await
            .expect("insert a");
        sqlx::query("INSERT INTO t (id) VALUES ('b')")
            .execute(&pool)
            .await
            .expect("insert b");
        sqlx::query("COMMIT").execute(&pool).await.expect("commit");

        assert_eq!(scalar_count(&pool).await, 2);
    }

    const KEY: [u8; 32] = [7u8; 32];

    #[tokio::test]
    async fn sqlcipher_is_the_linked_sqlite() {
        let dir = tempfile::tempdir().expect("tempdir");
        let pool = build_pool(&dir.path().join("k.db"), &KEY)
            .await
            .expect("pool");
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
        sqlx::query("CREATE TABLE t (id TEXT PRIMARY KEY)")
            .execute(&pool)
            .await
            .expect("create");
        sqlx::query("INSERT INTO t (id) VALUES ('secret-title')")
            .execute(&pool)
            .await
            .expect("insert");
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
        sqlx::query("CREATE TABLE t (id TEXT PRIMARY KEY)")
            .execute(&pool)
            .await
            .expect("create");
        pool.close().await;

        // Depending on the pragmas sqlx runs at connect, the failure surfaces
        // either while connecting or on the first read; both are a refusal.
        let refused = match build_pool(&path, &[8u8; 32]).await {
            Err(_) => true,
            Ok(other) => sqlx::query("SELECT COUNT(*) FROM t")
                .fetch_one(&other)
                .await
                .is_err(),
        };
        assert!(refused);
    }

    #[tokio::test]
    async fn the_right_key_reopens_it() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("k.db");
        let pool = build_pool(&path, &KEY).await.expect("pool");
        sqlx::query("CREATE TABLE t (id TEXT PRIMARY KEY)")
            .execute(&pool)
            .await
            .expect("create");
        sqlx::query("INSERT INTO t (id) VALUES ('a')")
            .execute(&pool)
            .await
            .expect("insert");
        pool.close().await;

        let again = build_pool(&path, &KEY).await.expect("reopen");
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM t")
            .fetch_one(&again)
            .await
            .expect("count");
        assert_eq!(n, 1);
    }
}
