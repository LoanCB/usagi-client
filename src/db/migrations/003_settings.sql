CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings (key, value)
  VALUES ('notification_enabled', 'true'),
         ('notification_times', '[{"hour":10,"minute":0},{"hour":14,"minute":0}]');
