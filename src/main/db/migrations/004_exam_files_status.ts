export const id = '004_exam_files_status'

// Bang exam_files tao o migration 003 chi co raw_extracted_text (null/khong
// null) de suy ra trang thai - khong du de phan biet 'pending' vs 'failed'.
// Them 2 cot giong het pattern da dung o bang attachments (M3).
export const sql = `
ALTER TABLE exam_files ADD COLUMN extraction_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (extraction_status IN ('pending','done','failed'));
ALTER TABLE exam_files ADD COLUMN file_size_bytes INTEGER NOT NULL DEFAULT 0;
`
