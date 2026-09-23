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
 * Chuan hoa dap an chay tram: GIU NGUYEN dau tieng Viet va dau cau, chi bo
 * phan biet hoa/thuong, bo gach ngang, gop khoang trang va mo rong cac viet
 * tat y khoa da duoc chot. Khong dung so khop mo/sai chinh ta.
 * chu tu do (anatomy point question) - khong dung Levenshtein, danh sach dap
 * an chap nhan duoc (accepted alternates) la co che chinh de bat bien the.
 */
export function normalizeForAnswerMatch(s: string): string {
  const normalized = s
    .normalize('NFC')
    .toLocaleLowerCase('vi')
    .replace(/-/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
  const expansions: Record<string, string> = {
    'đm': 'động mạch', tm: 'tĩnh mạch', dc: 'dây chằng', tk: 'thần kinh'
  }
  return normalized.split(' ').map((word) => expansions[word] ?? word).join(' ')
}
