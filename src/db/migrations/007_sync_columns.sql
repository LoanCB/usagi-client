-- Sync groundwork. Additive only: no column is dropped or renamed, so this
-- migration is safe to ship ahead of the sync engine and can be rolled back by
-- reverting the client.
--
-- field_updated_at holds a JSON map of {column: {t: iso8601, d: device_id}},
-- the basis for field-level last-writer-wins merging.
--
-- purged_at marks a permanently deleted row that must survive as a tombstone so
-- the deletion can propagate. It is distinct from deleted_at, which means
-- "archived" and is user-reversible.
ALTER TABLE tasks          ADD COLUMN field_updated_at TEXT;
ALTER TABLE tasks          ADD COLUMN purged_at        TEXT;

ALTER TABLE projects       ADD COLUMN field_updated_at TEXT;
ALTER TABLE projects       ADD COLUMN purged_at        TEXT;

ALTER TABLE tags           ADD COLUMN field_updated_at TEXT;
ALTER TABLE tags           ADD COLUMN purged_at        TEXT;

ALTER TABLE project_groups ADD COLUMN field_updated_at TEXT;
ALTER TABLE project_groups ADD COLUMN purged_at        TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_purged_at          ON tasks(purged_at);
CREATE INDEX IF NOT EXISTS idx_projects_purged_at       ON projects(purged_at);
CREATE INDEX IF NOT EXISTS idx_tags_purged_at           ON tags(purged_at);
CREATE INDEX IF NOT EXISTS idx_project_groups_purged_at ON project_groups(purged_at);
