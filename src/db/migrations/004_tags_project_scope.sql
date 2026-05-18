ALTER TABLE tags ADD COLUMN project_id TEXT REFERENCES projects(id);
CREATE INDEX IF NOT EXISTS idx_tags_project_id ON tags(project_id);
