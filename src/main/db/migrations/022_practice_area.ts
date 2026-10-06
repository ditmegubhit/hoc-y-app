export const id = '022_practice_area'

// Khu doc lap "Thuc hanh Giai phau": cay thu muc rieng (khong gan voi topics/
// lessons/attachments), file PDF la la cua cay. KHONG dong vao cac bang
// anatomy_* cu (giu nguyen tren dia, chi doc de do OCR roi bo).
//
// Quy uoc toa do: giong migration 018 - 'image_pixel' tren anh raster hoa boi
// renderPdfPageAsPng(RENDER_SCALE), luon kem ref_width/ref_height.
//
// practice_regions gop "o chu ung vien" va "cau hoi" lam mot:
//   status 'confirmed' = vung la CAU HOI (can answer_text khong rong),
//   status 'rejected'  = chi che, khong hoi,
//   status 'pending'   = nhap chua quyet.
//   reviewed = nguoi dung da duyet; manual = nguoi dung tu ve.
// Bai thi che MOI vung cua trang bang color_override ?? file.mask_color.
//
// Lich su lam bai dung ban chup (snapshot) dap an/hinh hoc/lop che trong
// practice_attempt_questions (region_id KHONG co khoa ngoai) de xoa vung hay
// sua dap an sau nay khong lam hong lich su.
export const sql = `
CREATE TABLE practice_nodes (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT REFERENCES practice_nodes(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('folder','file')),
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_practice_nodes_parent ON practice_nodes(parent_id);

CREATE TABLE practice_files (
  node_id                   TEXT PRIMARY KEY REFERENCES practice_nodes(id) ON DELETE CASCADE,
  stored_path               TEXT NOT NULL,
  file_size_bytes           INTEGER NOT NULL DEFAULT 0,
  source_path               TEXT,
  source_mtime_ms           INTEGER,
  needs_source_confirmation INTEGER NOT NULL DEFAULT 0,
  mask_color                TEXT NOT NULL DEFAULT '#0a0a0a',
  mask_opacity              REAL NOT NULL DEFAULT 0.5,
  scan_status               TEXT NOT NULL DEFAULT 'none' CHECK (scan_status IN ('none','scanning','done','failed')),
  total_pages               INTEGER,
  scan_last_page            INTEGER NOT NULL DEFAULT 0,
  scan_completed            INTEGER NOT NULL DEFAULT 0,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE practice_regions (
  id               TEXT PRIMARY KEY,
  file_id          TEXT NOT NULL REFERENCES practice_files(node_id) ON DELETE CASCADE,
  page_number      INTEGER NOT NULL,
  label_box_json   TEXT NOT NULL,
  ref_width        REAL NOT NULL,
  ref_height       REAL NOT NULL,
  raw_text         TEXT NOT NULL DEFAULT '',
  answer_text      TEXT,
  alternates_json  TEXT NOT NULL DEFAULT '[]',
  crop_box_json    TEXT,
  confidence       REAL,
  leader_score     REAL,
  suspect          INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
  reviewed         INTEGER NOT NULL DEFAULT 0,
  color_override   TEXT,
  opacity_override REAL,
  manual           INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_practice_regions_page ON practice_regions(file_id, page_number);

CREATE TABLE practice_page_reviews (
  file_id      TEXT NOT NULL REFERENCES practice_files(node_id) ON DELETE CASCADE,
  page_number  INTEGER NOT NULL,
  reviewed     INTEGER NOT NULL DEFAULT 0,
  excluded     INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (file_id, page_number)
);

CREATE TABLE practice_station_sets (
  id                  TEXT PRIMARY KEY,
  file_id             TEXT NOT NULL REFERENCES practice_files(node_id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  feedback_mode       TEXT NOT NULL CHECK (feedback_mode IN ('practice','exam')),
  time_limit_seconds  INTEGER NOT NULL CHECK (time_limit_seconds BETWEEN 0 AND 300),
  source_attempt_id   TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_practice_station_sets_file ON practice_station_sets(file_id);

CREATE TABLE practice_station_set_questions (
  station_set_id  TEXT NOT NULL REFERENCES practice_station_sets(id) ON DELETE CASCADE,
  region_id       TEXT NOT NULL REFERENCES practice_regions(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  PRIMARY KEY (station_set_id, region_id)
);

CREATE TABLE practice_attempts (
  id                  TEXT PRIMARY KEY,
  file_id             TEXT NOT NULL REFERENCES practice_files(node_id) ON DELETE CASCADE,
  station_set_id      TEXT REFERENCES practice_station_sets(id) ON DELETE SET NULL,
  station_set_name    TEXT NOT NULL DEFAULT '',
  feedback_mode       TEXT NOT NULL CHECK (feedback_mode IN ('practice','exam')),
  question_count      INTEGER NOT NULL,
  started_at          TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at        TEXT,
  duration_seconds    INTEGER,
  correct_count       INTEGER,
  score               REAL,
  time_limit_seconds  INTEGER NOT NULL DEFAULT 30,
  status              TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  current_index       INTEGER NOT NULL DEFAULT 0,
  remaining_ms        INTEGER,
  penalty_debt_ms     INTEGER NOT NULL DEFAULT 0,
  attempt_number      INTEGER NOT NULL DEFAULT 1,
  saved_history       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_practice_attempts_file ON practice_attempts(file_id);

CREATE TABLE practice_attempt_questions (
  attempt_id      TEXT NOT NULL REFERENCES practice_attempts(id) ON DELETE CASCADE,
  region_id       TEXT NOT NULL,
  position        INTEGER NOT NULL,
  page_number     INTEGER NOT NULL,
  answer_text     TEXT NOT NULL,
  alternates_json TEXT NOT NULL DEFAULT '[]',
  label_box_json  TEXT NOT NULL,
  crop_box_json   TEXT,
  ref_width       REAL NOT NULL,
  ref_height      REAL NOT NULL,
  masks_json      TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (attempt_id, region_id)
);

CREATE TABLE practice_attempt_answers (
  id              TEXT PRIMARY KEY,
  attempt_id      TEXT NOT NULL REFERENCES practice_attempts(id) ON DELETE CASCADE,
  region_id       TEXT NOT NULL,
  submitted_text  TEXT NOT NULL,
  is_correct      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_practice_attempt_answers_attempt ON practice_attempt_answers(attempt_id);
`
