export const id = '017_quiz_lms'

// Giao dien lam bai kieu LMS: luu thoi gian lam bai (giay), danh dau cau de xem
// lai (flagged), va gioi han thoi gian cho che do "Thi thu" (giay). Tat ca
// nullable / co DEFAULT nen an toan voi du lieu cu.
export const sql = `
ALTER TABLE quiz_attempts        ADD COLUMN duration_seconds  INTEGER;
ALTER TABLE quiz_attempt_answers ADD COLUMN flagged           INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quizzes              ADD COLUMN time_limit_seconds INTEGER;
`
