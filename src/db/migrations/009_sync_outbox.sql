-- Dirty-set of rows awaiting push, plus sync engine key/value state.
--
-- Triggers rather than repository instrumentation: the marking then shares the
-- writing transaction, so a crash cannot lose a change, and every future write
-- path is covered without touching sqlite-repository.ts.
--
-- This is a dirty set, not an operation log: PRIMARY KEY + INSERT OR REPLACE
-- collapses repeated writes to one row. The engine reads current row state at
-- push time, which makes push idempotent.
--
-- NOTE for the sync engine: applying a remote change fires these triggers too.
-- The engine must clear the outbox rows it caused, inside the same transaction,
-- except where the merge produced state the server does not yet have.
--
-- NOTE for future migrations: a table rebuild (see 006) is doubly destructive
-- for a synced table, and both halves fail silently.
--   1. It drops the table's triggers, so the table stops feeding this outbox
--      and silently stops syncing.
--   2. Its INSERT ... SELECT carries an explicit column list, frozen at the
--      schema of the day it was written. Columns added later --
--      field_updated_at, purged_at, sort_key -- are absent from that list, so
--      the rebuilt rows get NULL for them: merge metadata and ordering are
--      lost with no error raised.
-- Any migration rebuilding a synced table must therefore carry the sync
-- columns through its column list AND recreate the triggers.
CREATE TABLE IF NOT EXISTS sync_outbox (
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  dirtied_at  TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS trg_tasks_outbox_ins AFTER INSERT ON tasks
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('task', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_outbox_upd AFTER UPDATE ON tasks
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('task', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_outbox_del AFTER DELETE ON tasks
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('task', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_projects_outbox_ins AFTER INSERT ON projects
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('project', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_projects_outbox_upd AFTER UPDATE ON projects
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('project', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_projects_outbox_del AFTER DELETE ON projects
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('project', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_tags_outbox_ins AFTER INSERT ON tags
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('tag', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_tags_outbox_upd AFTER UPDATE ON tags
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('tag', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_tags_outbox_del AFTER DELETE ON tags
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('tag', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_project_groups_outbox_ins AFTER INSERT ON project_groups
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('project_group', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_project_groups_outbox_upd AFTER UPDATE ON project_groups
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('project_group', NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER IF NOT EXISTS trg_project_groups_outbox_del AFTER DELETE ON project_groups
BEGIN
  INSERT OR REPLACE INTO sync_outbox (entity_type, entity_id, dirtied_at)
  VALUES ('project_group', OLD.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;
