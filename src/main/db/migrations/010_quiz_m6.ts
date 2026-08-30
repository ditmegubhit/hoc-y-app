export const id = '010_quiz_m6'

// M6: che do lam bai kiem tra + cham diem. 4 bang quiz tu migration 003 chua
// tung co du lieu o bat ky ban cai nao (tinh nang chua ra mat) - SQLite khong
// ALTER duoc CHECK constraint nen o day DROP + tao lai voi hinh dang M6 can.
// Thu tu DROP: con truoc cha (PRAGMA foreign_keys = ON).
export const sql = `
DROP TABLE IF EXISTS quiz_attempt_answers;
DROP TABLE IF EXISTS quiz_attempts;
DROP TABLE IF EXISTS quiz_questions;
DROP TABLE IF EXISTS quizzes;

CREATE TABLE quizzes (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  scope_type       TEXT NOT NULL CHECK (scope_type IN ('lesson','topic')),
  lesson_id        TEXT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  topic_id         TEXT NULL REFERENCES topics(id) ON DELETE CASCADE,
  lesson_ids_json  TEXT NOT NULL DEFAULT '[]',
  feedback_mode    TEXT NOT NULL CHECK (feedback_mode IN ('practice','exam')),
  question_count   INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_quizzes_lesson ON quizzes(lesson_id);
CREATE INDEX idx_quizzes_topic  ON quizzes(topic_id);

CREATE TABLE quiz_questions (
  id             TEXT PRIMARY KEY,
  quiz_id        TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_id    TEXT NULL REFERENCES question_bank(id) ON DELETE SET NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  question_text  TEXT NOT NULL,
  options_json   TEXT NOT NULL,
  explanation    TEXT
);
CREATE INDEX idx_quiz_questions_quiz ON quiz_questions(quiz_id);

CREATE TABLE quiz_attempts (
  id             TEXT PRIMARY KEY,
  quiz_id        TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  feedback_mode  TEXT NOT NULL CHECK (feedback_mode IN ('practice','exam')),
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at   TEXT,
  correct_count  INTEGER,
  total_count    INTEGER,
  score          REAL
);
CREATE INDEX idx_quiz_attempts_quiz ON quiz_attempts(quiz_id);

CREATE TABLE quiz_attempt_answers (
  id                  TEXT PRIMARY KEY,
  attempt_id          TEXT NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  quiz_question_id    TEXT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  selected_option_id  TEXT,
  is_correct          INTEGER
);
CREATE INDEX idx_quiz_attempt_answers_attempt ON quiz_attempt_answers(attempt_id);
`
