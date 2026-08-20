export const id = '009_attachment_annotations'

// Luu net ve/highlight/hop ghi chu nguoi dung tu ve len tren file dinh kem
// (khong sua doi file goc - chi la 1 lop overlay hien thi de len tren luc
// xem trong panel). page_number la so trang/slide (unit_index) trong file
// da chuyen doi/render, khop voi cach PdfImageViewer danh so trang hien tai.
// data la JSON, cau truc tuy theo type (xem shared/types/annotation.ts):
// - highlight: { color, x, y, width, height }
// - pencil: { color, strokeWidth, points: [{x,y},...] }
// - note: { x, y, width, height, text }
// Toa do trong data deu tinh theo khung tham chieu co dinh BASE_CONTENT_WIDTH
// (760, xem PdfImageViewer.tsx) - khong phu thuoc zoom hien tai, de zoom
// thay doi van hien dung vi tri.
export const sql = `
CREATE TABLE attachment_annotations (
  id            TEXT PRIMARY KEY,
  attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  page_number   INTEGER NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('highlight','pencil','note')),
  data          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_attachment_annotations_lookup ON attachment_annotations(attachment_id);
`
