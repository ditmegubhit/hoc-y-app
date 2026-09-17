const COMBINING_MARKS = /[̀-ͯ]/g

/** Bo dau tieng Viet (chi de SO SANH, khong dung de hien thi). */
export function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

/**
 * Chuan hoa 1 cau tra loi de so khop "gan dung": bo dau, ve chu thuong, gop
 * khoang trang thua, cat khoang trang dau/cuoi. Dung cho cham diem cau hoi go
 * chu tu do (anatomy point question) - khong dung Levenshtein, danh sach dap
 * an chap nhan duoc (accepted alternates) la co che chinh de bat bien the.
 */
export function normalizeForAnswerMatch(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}
