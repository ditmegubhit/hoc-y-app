export const id = '006_search_index_units'

// FTS5 khong cho ALTER TABLE ADD COLUMN tren virtual table kieu nay, phai
// DROP + CREATE lai voi 2 cot moi unit_type/unit_index (UNINDEXED) de biet
// tu khoa nam o don vi nao (trang PDF, slide PPTX, toan van ban docx/anh,
// ghi chu bai hoc) thay vi chi 1 khoi text gop toan bo nhu truoc.
//
// Ghi chu bai hoc: backfill ngay bang SQL vi notes_text van con nguyen, khong
// can xu ly lai gi.
//
// Attachment (pdf/docx/pptx/anh): KHONG the tach lai theo trang tu
// extracted_text da gop (dau '\n\n' khong dang tin cay de split nguoc). Thay
// vi vay, dua cac attachment da co noi dung ve 'pending' de pipeline OCR/
// extract (da ho tro per-page/per-slide) tu chay lai va tu nap search_index
// dung cau truc moi khi app khoi dong - tai dung nguyen co che
// requeueStuckExtractions() da co san, khong can backfill rieng.
export const sql = `
DROP TABLE search_index;

CREATE VIRTUAL TABLE search_index USING fts5(
  title,
  content,
  lesson_id      UNINDEXED,
  topic_id       UNINDEXED,
  source_type    UNINDEXED,
  source_id      UNINDEXED,
  unit_type      UNINDEXED,
  unit_index     UNINDEXED,
  tokenize = "unicode61 remove_diacritics 2"
);

INSERT INTO search_index (title, content, lesson_id, topic_id, source_type, source_id, unit_type, unit_index)
SELECT title, notes_text, id, topic_id, 'lesson_note', id, 'note', 1
FROM lessons
WHERE notes_text IS NOT NULL AND trim(notes_text, ' ' || char(9,10,13)) != '';

UPDATE attachments SET extraction_status = 'pending'
WHERE extraction_status IN ('done', 'done_empty', 'ocr_processing');
`
