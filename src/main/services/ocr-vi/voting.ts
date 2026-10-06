import { normalizeForAnswerMatch, stripDiacritics } from '../../../shared/text/normalizeVietnamese'
import { isKnownTerm } from '../anatomy/vietnameseLabels'
import { scoreVietnameseText } from './vietnameseSyllable'

// Bo phieu giua cac ket qua nhan dang cua cung 1 dong chu (VietOCR, Tesseract...).
// KHONG sua chu: chi CHON 1 ung vien co san. Uu tien ung vien khop thuat ngu giai phau,
// co cac am tiet hop le, duoc nhieu bo doc dong thuan va it ky tu rac.

export interface Reading {
  text: string
  /** 0..1, do tin cay cua chinh bo nhan dang. */
  confidence: number
  source: string
  /** Trong so cua bo nhan dang (mac dinh 1). */
  weight?: number
}

export interface VoteDetail {
  known: boolean
  syllables: number
  agreement: number
  noise: number
  score: number
}

export interface VoteResult extends Reading {
  detail: VoteDetail
  /** So ung vien khac (khac chuoi) con lai, de UI biet "co bat dong". */
  disagreeing: number
}

export interface VoteOptions { additionalTerms?: readonly string[] }

const WEIRD = /[^\p{L}\p{N}\s/,.:;()\-–+&%]/gu

/** Ty le ky tu la/rac trong chuoi (0..1). */
export function noiseRatio(text: string): number {
  const compact = text.replace(/\s+/gu, '')
  if (compact.length === 0) return 1
  return (compact.match(WEIRD)?.length ?? 0) / compact.length
}

export function chooseBestReading(readings: readonly Reading[], options: VoteOptions = {}): VoteResult | null {
  const usable = readings.filter((r) => r.text.trim() !== '' && /[\p{L}\p{N}]/u.test(r.text))
  if (usable.length === 0) return null
  const extra = options.additionalTerms ?? []
  const weightOf = (r: Reading): number => r.weight ?? 1
  let best: VoteResult | null = null
  for (const candidate of usable) {
    const key = normalizeForAnswerMatch(candidate.text)
    const plainKey = stripDiacritics(key)
    let agreement = 0
    for (const other of usable) {
      if (other === candidate) continue
      const otherKey = normalizeForAnswerMatch(other.text)
      if (otherKey === key) agreement += 0.9 * weightOf(other)
      else if (stripDiacritics(otherKey) === plainKey) agreement += 0.25 * weightOf(other)
    }
    const known = isKnownTerm(candidate.text, extra)
    const syll = scoreVietnameseText(candidate.text)
    const noise = noiseRatio(candidate.text)
    const syllables = syll.ratio * 1.5 - (syll.fragmented ? 1 : 0)
    const score = (known ? 2.5 : 0) + syllables + agreement + 0.8 * candidate.confidence * weightOf(candidate) - 3 * noise
    if (!best || score > best.detail.score) {
      best = { ...candidate, detail: { known, syllables, agreement, noise, score }, disagreeing: 0 }
    }
  }
  if (!best) return null
  const bestKey = normalizeForAnswerMatch(best.text)
  best.disagreeing = usable.filter((r) => normalizeForAnswerMatch(r.text) !== bestKey).length
  return best
}
