export const id = '011_attachment_source'

// Luu duong dan FILE GOC (ngoai app) + mtime luc import gan nhat, de tu dong
// cap nhat lai trong app khi file goc bi sua ngoai may. File them TRUOC
// migration nay khong co source_path -> khong tu dong dong bo (khong biet file
// goc o dau).
export const sql = `
ALTER TABLE attachments ADD COLUMN source_path TEXT;
ALTER TABLE attachments ADD COLUMN source_mtime_ms INTEGER;
`
