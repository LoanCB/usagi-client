CREATE TABLE IF NOT EXISTS project_groups (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

ALTER TABLE projects ADD COLUMN group_id TEXT REFERENCES project_groups(id);

CREATE INDEX IF NOT EXISTS idx_projects_group_id ON projects(group_id);
