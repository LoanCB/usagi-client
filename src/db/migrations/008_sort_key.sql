-- Fractional index key, replacing integer sort_order for ordering.
--
-- Reordering with integers renumbers every row, so two offline devices conflict
-- on every task. A fractional key changes exactly one row per move, which
-- removes the conflict structurally rather than arbitrating it.
--
-- sort_order is deliberately kept and still written, so this release can be
-- rolled back. It is dropped in a later release, once sync has shipped.
--
-- Values are backfilled by backfillSortKeys(), which runs right after the
-- migration chain: fractional keys cannot be generated in pure SQL.
ALTER TABLE tasks          ADD COLUMN sort_key TEXT;
ALTER TABLE projects       ADD COLUMN sort_key TEXT;
ALTER TABLE project_groups ADD COLUMN sort_key TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_sort_key          ON tasks(sort_key);
CREATE INDEX IF NOT EXISTS idx_projects_sort_key       ON projects(sort_key);
CREATE INDEX IF NOT EXISTS idx_project_groups_sort_key ON project_groups(sort_key);
