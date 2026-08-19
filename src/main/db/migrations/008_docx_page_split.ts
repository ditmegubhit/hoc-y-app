export const id = '008_docx_page_split'

// Khong doi schema (search_index/word_positions giu nguyen cot) - chi doi
// CACH trich xuat DOCX: truoc day gop toan bo file thanh 1 chunk unit_type
// 'doc', gio tach theo tung "trang" that cua Word (dua vao marker
// w:lastRenderedPageBreak/w:br type=page trong XML goc, xem docx.extractor.ts)
// thanh nhieu chunk unit_type 'docPage'. Cac attachment DOCX da index truoc
// do van con unit_type='doc' cu, can OCR/extract lai de co du lieu moi -
// tai dung requeueStuckExtractions() da co san (giong pattern 006/007).
export const sql = `
UPDATE attachments SET extraction_status = 'pending'
WHERE file_type = 'docx'
  AND extraction_status IN ('done', 'done_empty', 'ocr_processing');
`
