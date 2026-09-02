export const id = '014_question_marked_good'

// Luu trang thai "da danh dau lam mau tot" ngay tren cau hoi (thay vi chi suy
// ra tu quiz_learning_examples) -> nut Star hien lai dung trang thai sau khi
// dong/mo lai overlay ngan hang cau hoi.
export const sql = `
ALTER TABLE question_bank ADD COLUMN marked_good INTEGER NOT NULL DEFAULT 0;
`
