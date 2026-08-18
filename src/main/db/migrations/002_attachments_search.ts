export const id = '002_attachments_search'

export const sql = `
CREATE TABLE attachments (
  id                 TEXT PRIMARY KEY,
  lesson_id          TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  file_name          TEXT NOT NULL,
  file_type          TEXT NOT NULL CHECK (file_type IN ('pdf','docx','pptx','png','jpg','jpeg','other')),
  stored_path        TEXT NOT NULL,
  file_size_bytes    INTEGER NOT NULL,
  extracted_text     TEXT,
  extraction_status  TEXT NOT NULL DEFAULT 'pending'
                       CHECK (extraction_status IN ('pending','done','failed','not_supported')),
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_attachments_lesson ON attachments(lesson_id);

CREATE VIRTUAL TABLE search_index USING fts5(
  title,
  content,
  lesson_id      UNINDEXED,
  topic_id       UNINDEXED,
  source_type    UNINDEXED,
  source_id      UNINDEXED,
  tokenize = "unicode61 remove_diacritics 2"
);
`
