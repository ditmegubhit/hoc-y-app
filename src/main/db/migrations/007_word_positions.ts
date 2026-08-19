export const id = '007_word_positions'

// Bang thuong (khong phai FTS5) luu toa do tung tu tren 1 trang PDF hoac 1
// anh roi, de sau nay ve khung to mau dung vi tri khi mo file goc. Tra cuu
// luon theo dung (source_type, source_id, unit_type, unit_index), khong can
// full-text search nen dung bang SQL binh thuong + index la du.
//
// coord_space phan biet 2 he toa do khac nhau:
// - 'pdf_point': toa do point he PDF goc (y-up), lay thang tu pdf.js
//   item.transform - dung cho trang PDF co text layer that.
// - 'image_pixel': toa do pixel cua anh PNG da render/OCR (y-down) - dung
//   cho trang PDF scan (OCR fallback) va anh roi. ref_width/ref_height la
//   kich thuoc anh do, bat buoc de quy doi nguoc ve point luc ve len PDF that.
//
// Backfill: dua attachment PDF/anh ve 'pending' de requeueStuckExtractions()
// (da co san tu tinh nang OCR truoc) tu OCR/extract lai va tu nap bang nay -
// giong het pattern migration 006, khong viet backfill rieng.
export const sql = `
CREATE TABLE word_positions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type  TEXT NOT NULL,
  source_id    TEXT NOT NULL,
  unit_type    TEXT NOT NULL CHECK (unit_type IN ('page','image')),
  unit_index   INTEGER NOT NULL,
  word_order   INTEGER NOT NULL,
  text         TEXT NOT NULL,
  x0           REAL NOT NULL,
  y0           REAL NOT NULL,
  x1           REAL NOT NULL,
  y1           REAL NOT NULL,
  coord_space  TEXT NOT NULL CHECK (coord_space IN ('pdf_point','image_pixel')),
  ref_width    REAL NOT NULL,
  ref_height   REAL NOT NULL
);
CREATE INDEX idx_word_positions_lookup
  ON word_positions(source_type, source_id, unit_type, unit_index);

UPDATE attachments SET extraction_status = 'pending'
WHERE file_type IN ('pdf','png','jpg','jpeg')
  AND extraction_status IN ('done','done_empty','ocr_processing');
`
