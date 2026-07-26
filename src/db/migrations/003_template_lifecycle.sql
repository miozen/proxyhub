ALTER TABLE template_versions ADD COLUMN parent_id TEXT REFERENCES template_versions(id) ON DELETE SET NULL;
ALTER TABLE template_versions ADD COLUMN status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE template_versions ADD COLUMN last_checked_at TEXT;
ALTER TABLE template_versions ADD COLUMN last_error TEXT;

CREATE INDEX template_versions_parent_id_idx ON template_versions(parent_id);

