-- Plan 4c. ADD COLUMN only: rebuilding a synced table would drop its outbox
-- triggers and every sync column added since (trap documented in 009).

-- Unknown-field preservation (spec §5.4). A newer client may sync fields this
-- version does not know; their values are carried here verbatim as a JSON
-- object and re-emitted on push. Their per-field stamps need no new home:
-- field_updated_at is a JSON map keyed by field name and accepts any key.
ALTER TABLE tasks          ADD COLUMN sync_extra TEXT;
ALTER TABLE projects       ADD COLUMN sync_extra TEXT;
ALTER TABLE tags           ADD COLUMN sync_extra TEXT;
ALTER TABLE project_groups ADD COLUMN sync_extra TEXT;

-- Quarantine (spec §7): an undecryptable blob must never block the loop, and
-- the pull cursor moves past it, so the server will not serve it again until
-- it changes. Dropping it would be a silent, permanent divergence between
-- devices — the blob is kept for a later retry instead. direction 'push'
-- parks a local record whose plaintext exceeds the server's ciphertext bound
-- (batch validation rejects the WHOLE batch, so one oversized record would
-- otherwise wedge the outbox forever).
CREATE TABLE IF NOT EXISTS sync_quarantine (
  entity_type    TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  seq            INTEGER,
  direction      TEXT NOT NULL CHECK (direction IN ('pull', 'push')),
  ciphertext     TEXT,
  nonce          TEXT,
  reason         TEXT NOT NULL,
  quarantined_at TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);
