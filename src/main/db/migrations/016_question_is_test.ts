export const id = '016_question_is_test'

// Danh dau cau hoi do dot "chay thu" (smoke test) sinh ra - de hien MAU DO trong
// ngan hang cau hoi, phan biet voi cau that. Chi dung trong bai "Nơi test app".
export const sql = `
ALTER TABLE question_bank ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
`
