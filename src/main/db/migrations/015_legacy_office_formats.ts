export const id = '015_legacy_office_formats'

// Truoc day .doc/.ppt khong duoc nhan dang -> luu file_type='other',
// extraction_status='not_supported'. Gio Word/PowerPoint mo duoc ca 2 nen
// quy ve 'docx'/'pptx' va cho trich xuat lai (qua duong chuyen sang PDF,
// xem legacyOffice.extractor.ts). requeueStuckExtractions() luc khoi dong se
// nhat cac dong 'pending' nay va chay lai.
// LIKE '%.doc' khong khop '.docx' (khac ky tu cuoi), tuong tu '.ppt' vs '.pptx'.
export const sql = `
UPDATE attachments SET file_type = 'docx', extraction_status = 'pending'
WHERE file_type = 'other' AND lower(file_name) LIKE '%.doc';

UPDATE attachments SET file_type = 'pptx', extraction_status = 'pending'
WHERE file_type = 'other' AND lower(file_name) LIKE '%.ppt';
`
