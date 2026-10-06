export const id = '023_practice_region_reason'

// Ly do nghi rac (mang chuoi hien thi) cua vung do tu dong; '[]' voi cac vung cu va vung tu ve.
export const sql = `
ALTER TABLE practice_regions ADD COLUMN suspect_reasons_json TEXT NOT NULL DEFAULT '[]';
`
