import { normalizeForAnswerMatch } from '../../../shared/text/normalizeVietnamese'
import { suggestVietnameseLabel } from '../anatomy/vietnameseLabels'
import { chooseBestReading, type Reading } from './voting'

// Gop cac cach doc cua 1 o nhan (VietOCR, Tesseract...) thanh 1 ket qua: bo phieu + tu dien (thuan, co test).

export interface LabelRecognition {
  text: string
  /** 0..1: cao khi 2 bo doc dong thuan hoac khop thuat ngu; thap khi bat dong. */
  confidence: number
  /** 'vote:vietocr', 'vote:tesseract', 'vietocr', 'tesseract', 'dictionary:<nguon>' hoac 'none'. */
  source: string
  /** Cac cach doc khac (da bo phieu) de UI/Claude doi chieu. */
  alternatives: Array<{ text: string; source: string; confidence: number }>
}

export function combine(readings: Reading[], additionalTerms: readonly string[] = []): LabelRecognition {
  const winner = chooseBestReading(readings, { additionalTerms })
  if (!winner) return { text: '', confidence: 0, source: 'none', alternatives: [] }
  const key = normalizeForAnswerMatch(winner.text)
  const others = readings.filter((r) => r !== winner && r.text.trim() !== '')
  const agreed = others.filter((r) => normalizeForAnswerMatch(r.text) === key)
  let confidence: number
  if (others.length > 0 && agreed.length === others.length) {
    confidence = Math.min(0.99, (winner.confidence + agreed.reduce((a, r) => a + r.confidence, 0)) / (1 + agreed.length) + 0.15)
  } else if (others.length === 0) {
    confidence = winner.confidence * 0.9
  } else {
    confidence = winner.confidence * 0.75
  }
  if (winner.detail.known) confidence = Math.min(0.99, confidence + 0.1)
  let text = winner.text
  let source = readings.length > 1 ? `vote:${winner.source}` : winner.source
  const fixed = suggestVietnameseLabel(text, additionalTerms)
  if (fixed) { text = fixed; source = `dictionary:${winner.source}` }
  return {
    text, confidence: Math.max(0, Math.min(1, confidence)), source,
    alternatives: others.filter((r) => normalizeForAnswerMatch(r.text) !== key)
      .map((r) => ({ text: r.text, source: r.source, confidence: r.confidence }))
  }
}

