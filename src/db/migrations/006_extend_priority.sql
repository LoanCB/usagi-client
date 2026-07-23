-- Widen the tasks.priority CHECK to the 7 criticity levels.
-- SQLite can't alter a CHECK in place, so rebuild the table and copy the rows.
-- Disable FK enforcement while rebuilding: task_tags references tasks(id), so
-- the implicit DELETE done by DROP TABLE would otherwise be rejected. App init
-- runs these statements serially on a single connection, so the toggle holds.
PRAGMA foreign_keys = OFF;

CREATE TABLE tasks_new (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  project_id   TEXT REFERENCES projects(id),
  priority     TEXT DEFAULT 'none'
                 CHECK(priority IN ('none', 'lowest', 'low', 'medium', 'high', 'highest', 'blocker')),
  due_date     TEXT,
  completed_at TEXT,
  sort_order   INTEGER DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);

INSERT INTO tasks_new (id, title, description, project_id, priority, due_date, completed_at, sort_order, created_at, updated_at, deleted_at)
  SELECT id, title, description, project_id, priority, due_date, completed_at, sort_order, created_at, updated_at, deleted_at
  FROM tasks;

DROP TABLE tasks;

ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date   ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);

PRAGMA foreign_keys = ON;
