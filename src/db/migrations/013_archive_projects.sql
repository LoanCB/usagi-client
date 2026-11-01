-- archived_at, not deleted_at: deleteProject already writes projects.deleted_at
-- and nothing restores it, so reusing it would bring every project ever deleted
-- back into the Archives.
--
-- Tasks carry no matching column on purpose. Their visibility derives from
-- their project, so archiving writes one row, and a restore cannot confuse the
-- tasks archived along with the project with those archived on their own.
ALTER TABLE projects       ADD COLUMN archived_at TEXT;
ALTER TABLE project_groups ADD COLUMN archived_at TEXT;
