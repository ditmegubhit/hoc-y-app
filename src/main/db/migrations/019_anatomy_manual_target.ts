export const id = '019_anatomy_manual_target'

// Doi thiet ke "Thi thuc hanh giai phau": BO HAN buoc thuat toan tu do "mui
// ten tro toi dau" (khong dang tin cay - da thu va nguoi dung danh gia
// "khong on"). Thiet ke moi: van tu dong do O CHU (PaddleOCR, xem
// detectPage.ts) de biet vi tri can CHE, nhung tac gia TU CHON 1 trong cac o
// chu do (hoac tu ve 1 o moi) lam "cau hoi", tu go dap an - khong con doan vi
// tri tham chieu toi cau truc giai phau nua (anh goc da co san mui ten/duong
// ke rieng cua no, van con nhin thay vi chi che CHU khong che duong ke).
//
// DROP + tao lai 4 bang anatomy_* (chua tung release, xem migration 010 cho
// tien le tuong tu) - du lieu cu (2228 candidate/1107 cau hoi tu dong xac
// nhan) khong con hop schema moi, da duoc nguoi dung dong y xoa lam lai.
export const sql = `
DROP TABLE IF EXISTS anatomy_quiz_attempt_answers;
DROP TABLE IF EXISTS anatomy_quiz_attempts;
DROP TABLE IF EXISTS anatomy_questions;
DROP TABLE IF EXISTS anatomy_label_candidates;

CREATE TABLE anatomy_label_candidates (
  id             TEXT PRIMARY KEY,
  attachment_id  TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  page_number    INTEGER NOT NULL,
  raw_text       TEXT NOT NULL,
  label_box_json TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
  ref_width      REAL NOT NULL,
  ref_height     REAL NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_anatomy_candidates_page ON anatomy_label_candidates(attachment_id, page_number);

CREATE TABLE anatomy_questions (
  id                        TEXT PRIMARY KEY,
  attachment_id             TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  lesson_id                 TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  page_number               INTEGER NOT NULL,
  candidate_id              TEXT REFERENCES anatomy_label_candidates(id) ON DELETE SET NULL,
  answer_text               TEXT NOT NULL,
  accepted_alternates_json  TEXT NOT NULL DEFAULT '[]',
  mask_boxes_json           TEXT NOT NULL,
  target_box_json           TEXT NOT NULL,
  ref_width                 REAL NOT NULL,
  ref_height                REAL NOT NULL,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_anatomy_questions_attachment ON anatomy_questions(attachment_id);
CREATE INDEX idx_anatomy_questions_lesson     ON anatomy_questions(lesson_id);

CREATE TABLE anatomy_quiz_attempts (
  id                TEXT PRIMARY KEY,
  attachment_id     TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  feedback_mode     TEXT NOT NULL CHECK (feedback_mode IN ('practice','exam')),
  question_count    INTEGER NOT NULL,
  started_at        TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at      TEXT,
  duration_seconds  INTEGER,
  correct_count     INTEGER,
  score             REAL
);
CREATE INDEX idx_anatomy_attempts_attachment ON anatomy_quiz_attempts(attachment_id);

CREATE TABLE anatomy_quiz_attempt_answers (
  id              TEXT PRIMARY KEY,
  attempt_id      TEXT NOT NULL REFERENCES anatomy_quiz_attempts(id) ON DELETE CASCADE,
  question_id     TEXT NOT NULL REFERENCES anatomy_questions(id) ON DELETE CASCADE,
  submitted_text  TEXT NOT NULL,
  is_correct      INTEGER NOT NULL
);
CREATE INDEX idx_anatomy_attempt_answers_attempt ON anatomy_quiz_attempt_answers(attempt_id);
`
