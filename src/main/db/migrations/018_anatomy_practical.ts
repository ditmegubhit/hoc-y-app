export const id = '018_anatomy_practical'

// Che do thi rieng "Thi thuc hanh giai phau": hien 1 trang anh tu file dinh
// kem, che het vung chu, ve 1 mui ten tro vao 1 diem, nguoi lam bai go dap an
// tu do. Tach hoan toan khoi question_bank/quizzes (khong phai trac nghiem,
// khong co "options", cham diem theo van ban) - dung schema rieng, giong cach
// word_positions/attachment_annotations da dung rieng ben canh he quiz thay vi
// nhet vao bang chung.
//
// Quy uoc toa do: 'image_pixel' tren anh raster hoa boi renderPdfPageAsPng()
// (RENDER_SCALE), giong het word_positions.coord_space='image_pixel'. Luon kem
// ref_width/ref_height de quy doi ve kich thuoc hien thi thuc te
// (x * displayedWidth / ref_width) - cung cong thuc AnnotationLayer.tsx dang
// dung cho zoom.
//
// anatomy_label_candidates: tap nhan nghi ngo tu thuat toan do mui ten (xem
// services/anatomy/labelDetection.ts), CHUA phai cau hoi that - can nguoi soan
// xac nhan/sua/tu choi truoc. label_kind phan biet 3 loai chu thich nguoi dung
// da mo ta: viet tay co mui ten rieng, viet tay khong mui ten (co the duoc gop
// vao 1 nhan co mui ten gan do, xem grouped_with_id), va chu go co duong dan.
//
// anatomy_questions: cau hoi DA XAC NHAN, san sang dua vao lam bai thi.
// mask_boxes_json chup lai TOAN BO o nhan tren trang tai thoi diem xac nhan
// (ke ca cau bi tu choi/chua xac dinh - chu cua chung van phai bi che khi thi,
// khong duoc de lo), khong tinh lai tu candidates luc thi (on dinh, giong cach
// quiz_questions snapshot options_json thay vi doc lai question_bank).
export const sql = `
CREATE TABLE anatomy_label_candidates (
  id                TEXT PRIMARY KEY,
  attachment_id     TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  page_number       INTEGER NOT NULL,
  label_kind        TEXT NOT NULL CHECK (label_kind IN ('handwritten_arrowed','handwritten_bare','printed_arrowed')),
  raw_text          TEXT NOT NULL,
  label_box_json    TEXT NOT NULL,
  arrow_point_json  TEXT,
  arrow_source      TEXT NOT NULL DEFAULT 'undetected' CHECK (arrow_source IN ('traced','grouped','manual','undetected')),
  grouped_with_id   TEXT REFERENCES anatomy_label_candidates(id) ON DELETE SET NULL,
  color_hex         TEXT,
  confidence        REAL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
  ref_width         REAL NOT NULL,
  ref_height        REAL NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
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
  arrow_point_json          TEXT NOT NULL,
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
