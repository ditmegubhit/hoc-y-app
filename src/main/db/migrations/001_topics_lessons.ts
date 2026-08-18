export const id = '001_topics_lessons'

export const sql = `
CREATE TABLE topics (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT NULL REFERENCES topics(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_topics_parent ON topics(parent_id);

CREATE TABLE lessons (
  id         TEXT PRIMARY KEY,
  topic_id   TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  notes_json TEXT,
  notes_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_lessons_topic ON lessons(topic_id);
`
