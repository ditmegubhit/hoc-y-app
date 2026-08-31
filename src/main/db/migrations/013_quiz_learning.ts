export const id = '013_quiz_learning'

// Ho tro Ollama "hoc dan" tao cau hoi:
// - question_bank.generator: engine da sinh cau ('claude' | 'ollama'), cau cu = NULL.
// - quiz_learning_examples: cac cap "cau chua dat -> cau da sua" (Claude sua khi
//   ra soat, hoac user tu sua cau Ollama) dung lam vi du few-shot.
export const sql = `
ALTER TABLE question_bank ADD COLUMN generator TEXT;

CREATE TABLE quiz_learning_examples (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,
  topic_id      TEXT NULL,
  lesson_id     TEXT NULL,
  before_json   TEXT NULL,
  after_json    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_qle_topic  ON quiz_learning_examples(topic_id);
CREATE INDEX idx_qle_lesson ON quiz_learning_examples(lesson_id);
`
