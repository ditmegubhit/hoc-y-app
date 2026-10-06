import { normalizeForAnswerMatch, stripDiacritics } from '../../../shared/text/normalizeVietnamese'

// Do do chinh xac nhan dang chu (thuan): dung cho bo do OCR va test.

export function levenshtein(a: string, b: string): number {
  const x = [...a]; const y = [...b]
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i)
  for (let i = 1; i <= x.length; i++) {
    const cur = [i]
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[y.length]
}

/** CER co dau (sau normalizeForAnswerMatch: thuong hoa, NFC, mo rong viet tat DM/TM/DC/TK). */
export function cerWithAccents(read: string, ref: string): number {
  const r = normalizeForAnswerMatch(ref); const t = normalizeForAnswerMatch(read)
  if (r.length === 0) return t.length === 0 ? 0 : 1
  return Math.min(1, levenshtein(t, r) / r.length)
}

/** CER bo dau (chi so chu cai goc): do kha nang "gan dung" khi OCR mat dau. */
export function cerNoAccents(read: string, ref: string): number {
  const r = stripDiacritics(normalizeForAnswerMatch(ref)); const t = stripDiacritics(normalizeForAnswerMatch(read))
  if (r.length === 0) return t.length === 0 ? 0 : 1
  return Math.min(1, levenshtein(t, r) / r.length)
}

export function isExactMatch(read: string, ref: string): boolean {
  return normalizeForAnswerMatch(read) === normalizeForAnswerMatch(ref)
}
