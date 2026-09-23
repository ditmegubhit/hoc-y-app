export const id = '020_anatomy_station_v2'

// V2: de chay tram co cau hoi co dinh, timer tung cau, khoi phuc luot thi,
// crop nhom anh va trang thai quet/duyet. Migration 018/019 chua tung phat
// hanh chinh thuc, nhung 020 van chi bo sung de DB da tung chay branch cu
// khong mat du lieu.
export const sql = `
ALTER TABLE anatomy_label_candidates ADD COLUMN confidence REAL;
ALTER TABLE anatomy_label_candidates ADD COLUMN crop_box_json TEXT;
ALTER TABLE anatomy_questions ADD COLUMN crop_box_json TEXT;

ALTER TABLE anatomy_quiz_attempts ADD COLUMN station_set_id TEXT;
ALTER TABLE anatomy_quiz_attempts ADD COLUMN time_limit_seconds INTEGER NOT NULL DEFAULT 30;
ALTER TABLE anatomy_quiz_attempts ADD COLUMN status TEXT NOT NULL DEFAULT 'in_progress';
ALTER TABLE anatomy_quiz_attempts ADD COLUMN current_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE anatomy_quiz_attempts ADD COLUMN remaining_ms INTEGER;
ALTER TABLE anatomy_quiz_attempts ADD COLUMN penalty_debt_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE anatomy_quiz_attempts ADD COLUMN attempt_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE anatomy_quiz_attempts ADD COLUMN saved_history INTEGER NOT NULL DEFAULT 0;

CREATE TABLE anatomy_station_sets (
  id                  TEXT PRIMARY KEY,
  attachment_id       TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  feedback_mode       TEXT NOT NULL CHECK (feedback_mode IN ('practice','exam')),
  time_limit_seconds  INTEGER NOT NULL CHECK (time_limit_seconds BETWEEN 0 AND 300),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_anatomy_station_sets_attachment ON anatomy_station_sets(attachment_id);

CREATE TABLE anatomy_station_set_questions (
  station_set_id TEXT NOT NULL REFERENCES anatomy_station_sets(id) ON DELETE CASCADE,
  question_id    TEXT NOT NULL REFERENCES anatomy_questions(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL,
  PRIMARY KEY (station_set_id, question_id)
);

CREATE TABLE anatomy_attempt_questions (
  attempt_id  TEXT NOT NULL REFERENCES anatomy_quiz_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES anatomy_questions(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  PRIMARY KEY (attempt_id, question_id)
);

CREATE TABLE anatomy_page_reviews (
  attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  page_number   INTEGER NOT NULL,
  reviewed      INTEGER NOT NULL DEFAULT 0,
  excluded      INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (attachment_id, page_number)
);

CREATE TABLE anatomy_attachment_eligibility (
  attachment_id      TEXT PRIMARY KEY REFERENCES attachments(id) ON DELETE CASCADE,
  status             TEXT NOT NULL CHECK (status IN ('legacy','analyzing','eligible','ineligible','failed')),
  image_page_ratio   REAL,
  analyzed_pages     INTEGER NOT NULL DEFAULT 0,
  total_pages        INTEGER NOT NULL DEFAULT 0,
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE anatomy_scan_progress (
  attachment_id   TEXT PRIMARY KEY REFERENCES attachments(id) ON DELETE CASCADE,
  last_page       INTEGER NOT NULL DEFAULT 0,
  total_pages     INTEGER NOT NULL DEFAULT 0,
  completed       INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- File cu khong tu dong duoc them nut, tru file khao sat da chot.
INSERT INTO anatomy_attachment_eligibility (attachment_id, status, image_page_ratio)
SELECT id,
       CASE WHEN lower(file_name) LIKE '%he than - tiet nieu (tong hop)%' THEN 'eligible' ELSE 'legacy' END,
       CASE WHEN lower(file_name) LIKE '%he than - tiet nieu (tong hop)%' THEN 1.0 ELSE NULL END
FROM attachments
WHERE file_type = 'pdf';
`
