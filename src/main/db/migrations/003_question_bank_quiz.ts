export const id = '003_question_bank_quiz'

export const sql = `
CREATE TABLE exam_files (
  id                   TEXT PRIMARY KEY,
  file_name            TEXT NOT NULL,
  file_type            TEXT NOT NULL CHECK (file_type IN ('pdf','docx','pptx')),
  stored_path          TEXT NOT NULL,
  raw_extracted_text   TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE question_bank (
  id             TEXT PRIMARY KEY,
  question_text  TEXT NOT NULL,
  options_json   TEXT NOT NULL,
  explanation    TEXT,
  source         TEXT NOT NULL CHECK (source IN ('ai_generated_from_lesson','extracted_from_exam_file')),
  lesson_id      TEXT NULL REFERENCES lessons(id) ON DELETE SET NULL,
  exam_file_id   TEXT NULL REFERENCES exam_files(id) ON DELETE SET NULL,
  topic_id       TEXT NULL,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','approved')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_question_bank_source ON question_bank(source);
CREATE INDEX idx_question_bank_topic ON question_bank(topic_id);
CREATE INDEX idx_question_bank_lesson ON question_bank(lesson_id);

CREATE TABLE quizzes (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  mode        TEXT NOT NULL CHECK (mode IN ('ai_from_lesson','from_exam_bank','combined')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE quiz_questions (
  id           TEXT PRIMARY KEY,
  quiz_id      TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE quiz_attempts (
  id            TEXT PRIMARY KEY,
  quiz_id       TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at  TEXT,
  score         REAL
);

CREATE TABLE quiz_attempt_answers (
  id                  TEXT PRIMARY KEY,
  attempt_id          TEXT NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  quiz_question_id    TEXT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  selected_option_id  TEXT,
  is_correct          INTEGER
);
`
