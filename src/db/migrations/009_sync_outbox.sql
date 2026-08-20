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
-- NOTE for future migrations: a table rebuild (see 006) drops its triggers.
-- Any migration rebuilding a synced table must recreate them.
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
