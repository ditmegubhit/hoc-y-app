export const id = '005_ocr_extraction_status'

// SQLite khong cho ALTER ... MODIFY CHECK, phai rebuild bang attachments voi
// CHECK moi them 'ocr_processing' (dang OCR) va 'done_empty' (da xu ly xong,
// ke ca da OCR, nhung khong tim thay text nao - thay cho viec truoc day bi
// gan nham 'done' voi extracted_text rong ma khong ai biet).
//
// Backfill ngay trong migration: cac row cu dang 'done' nhung extracted_text
// rong/null (bug goc - vd file PDF scan cua user) duoc chuyen sang
// 'done_empty' ngay lap tuc, de attachments.service.requeueStuckExtractions()
// tu dong OCR lai khi app khoi dong lan sau.
export const sql = `
CREATE TABLE attachments_new (
  id                 TEXT PRIMARY KEY,
  lesson_id          TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  file_name          TEXT NOT NULL,
  file_type          TEXT NOT NULL CHECK (file_type IN ('pdf','docx','pptx','png','jpg','jpeg','other')),
  stored_path        TEXT NOT NULL,
  file_size_bytes    INTEGER NOT NULL,
  extracted_text     TEXT,
  extraction_status  TEXT NOT NULL DEFAULT 'pending'
                       CHECK (extraction_status IN
                         ('pending','ocr_processing','done','done_empty','failed','not_supported')),
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO attachments_new
  (id, lesson_id, file_name, file_type, stored_path, file_size_bytes, extracted_text, extraction_status, created_at)
SELECT
  id, lesson_id, file_name, file_type, stored_path, file_size_bytes, extracted_text,
  -- Ham trim() 1 doi so cua SQLite chi bo ky tu space, KHONG bo newline/tab/CR.
  -- Bug goc sinh ra text toan ky tu xuong dong (vd file that cua user), nen
  -- phai chi ro tap ky tu can trim bang dang trim(X, Y) 2 doi so.
  CASE
    WHEN extraction_status = 'done'
      AND (extracted_text IS NULL OR trim(extracted_text, ' ' || char(9,10,13)) = '')
      THEN 'done_empty'
    ELSE extraction_status
  END,
  created_at
FROM attachments;

DROP TABLE attachments;
ALTER TABLE attachments_new RENAME TO attachments;
CREATE INDEX idx_attachments_lesson ON attachments(lesson_id);
`
