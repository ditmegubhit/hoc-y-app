import type { WordPositionRow } from '../../db/repositories/wordPositions.repo'

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

function normalizeToken(raw: string): string {
  return raw.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

interface AtomicToken {
  normalized: string
  wordIndex: number
}

// Mot "word" (bbox) da luu co the la ca 1 cum/dong (vd item cua pdf.js voi
// trang chu that, khac voi OCR luon la dung 1 tu) - tach nho thanh token de
// so khop, nhung van gan lai dung wordIndex goc (cung 1 bbox) de sau nay gom
// khung to mau.
function buildAtomicTokens(words: WordPositionRow[]): AtomicToken[] {
  const atoms: AtomicToken[] = []
  words.forEach((word, wordIndex) => {
    for (const raw of tokenize(word.text)) {
      const normalized = normalizeToken(raw)
      if (normalized) atoms.push({ normalized, wordIndex })
    }
  })
  return atoms
}

// Truot cua so tim day token lien tiep khop voi matchedText (khong phan biet
// hoa/thuong, bo dau cau) - KHONG canh offset ky tu voi chunk.text (de vo vi
// cach noi text cua OCR/pdf.js khac nhau), chi so sanh chuoi token thuan tuy.
export function findWordRunForText(
  words: WordPositionRow[],
  matchedText: string
): WordPositionRow[] | null {
  const queryTokens = tokenize(matchedText).map(normalizeToken).filter(Boolean)
  if (queryTokens.length === 0) return null

  const atoms = buildAtomicTokens(words)
  if (atoms.length < queryTokens.length) return null

  for (let start = 0; start <= atoms.length - queryTokens.length; start++) {
    let matched = true
    for (let j = 0; j < queryTokens.length; j++) {
      if (atoms[start + j].normalized !== queryTokens[j]) {
        matched = false
        break
      }
    }
    if (matched) {
      const wordIndices = new Set<number>()
      for (let j = 0; j < queryTokens.length; j++) wordIndices.add(atoms[start + j].wordIndex)
      return Array.from(wordIndices)
        .sort((a, b) => a - b)
        .map((idx) => words[idx])
    }
  }
  return null
}

// Gom cac tu khop thanh 1+ hinh chu nhat theo dong (nhom theo do gan truc y)
// - xu ly truong hop tu khoa khop vat qua nhieu dong.
export function unionRectsByLine(words: WordPositionRow[]): Rect[] {
  if (words.length === 0) return []

  const heights = words.map((w) => Math.abs(w.bbox.y1 - w.bbox.y0))
  const avgHeight = heights.reduce((a, b) => a + b, 0) / heights.length
  const threshold = avgHeight * 0.6 || 5

  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0)
  const groups: WordPositionRow[][] = []
  for (const word of sorted) {
    const last = groups[groups.length - 1]
    if (last && Math.abs(word.bbox.y0 - last[0].bbox.y0) <= threshold) {
      last.push(word)
    } else {
      groups.push([word])
    }
  }

  return groups.map((group) => ({
    x0: Math.min(...group.map((w) => w.bbox.x0)),
    y0: Math.min(...group.map((w) => w.bbox.y0)),
    x1: Math.max(...group.map((w) => w.bbox.x1)),
    y1: Math.max(...group.map((w) => w.bbox.y1))
  }))
}
