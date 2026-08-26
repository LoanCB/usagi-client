//! Registers the app's SQLite pool with tauri-plugin-sql.
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

use std::path::{Path, PathBuf};

use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use tauri::{
    plugin::{Builder as PluginBuilder, TauriPlugin},
    AppHandle, Manager, Runtime,
};
use tauri_plugin_sql::{DbInstances, DbPool};

/// The connection string the frontend passes to `Database.get`, and the key
/// the plugin looks the pool up under. Both sides must spell it the same way.
pub const DB_URL: &str = "sqlite:usagi.db";

/// The file name inside the app config dir, as `path_mapper` in
/// tauri-plugin-sql derives it from [`DB_URL`]. Kept identical so the pool
/// opens the database users already have rather than a fresh one beside it.
const DB_FILE: &str = "usagi.db";

pub async fn build_pool(path: &Path) -> Result<SqlitePool, sqlx::Error> {
    let options = SqliteConnectOptions::new()
        .filename(path)
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

/// Register the pool as a plugin, not through `Builder::setup`: plugins are
/// initialized while the app is being built, whereas the setup hook runs after
/// the window exists — and a window that exists can already be querying.
///
/// Must be registered AFTER `tauri_plugin_sql`, which is what creates the
/// `DbInstances` map this writes into.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("usagi-db")
        .setup(|app, _api| register(app))
        .build()
}

/// Open the pool and hand it to the plugin under [`DB_URL`], so the frontend
/// reaches it with `Database.get` instead of `Database.load` (which would
/// build a default, multi-connection pool and overwrite this one).
fn register<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let path = database_path(app)?;
    let pool = tauri::async_runtime::block_on(build_pool(&path))?;
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

fn database_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let mut dir = app.path().app_config_dir()?;
    std::fs::create_dir_all(&dir)?;
    dir.push(DB_FILE);
    Ok(dir)
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
        let pool = build_pool(&dir.path().join("one.db")).await.expect("pool");
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
        let pool = build_pool(&dir.path().join("rollback.db"))
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
        let pool = build_pool(&dir.path().join("commit.db"))
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
}
