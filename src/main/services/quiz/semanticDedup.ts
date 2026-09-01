import type { DraftQuestion } from '../../../shared/types/question'
import { normalizeQuestionText } from './dedup'

// So trung cau hoi theo NGU NGHIA (khong chi khop tung chu nhu `dedupeQuestions`).
//
// Hai tang:
//  1. So khop mo bang JS thuan - luon chay, offline, khong tai gi. Bo dau tieng
//     Viet + stopword khi so -> bat duoc cau dien dat lai ("Phe nang lam gi?" vs
//     "Chuc nang cua phe nang la gi?").
//  2. Neu co `embedder` (may da tai san model nhung cho Ollama) -> so them bang
//     cosine tren vector nhung, bat duoc ca cau khac tu hoan toan cung mot y.
//
// Module nay THUAN (khong dung Electron) de test bang vitest. Phan goi Ollama
// embeddings do tang tren (ollamaClient) tiem vao qua `options.embedder`.

const VI_STOPWORDS = new Set([
  'la', 'va', 'cua', 'cho', 'trong', 'khi', 'nao', 'gi', 'thi', 'mot', 'cac',
  'nhung', 'de', 'duoc', 'co', 'khong', 'nhat', 'chinh', 'sau', 'day', 'voi',
  'tren', 'duoi', 'tai', 've', 'theo', 'do', 'nay', 'hay', 'hoac', 'bi', 'se',
  'da', 'dang', 'ra', 'vao', 'den', 'tu', 'boi', 'lai', 'con', 'rang', 'nhu',
  'phai', 'that', 'rat', 'hon', 'bao', 'nhieu', 'it', 'moi', 'tat', 'ca', 'dau',
  'phan', 'loai', 'nguoi', 'truong', 'thanh'
])

const COMBINING_MARKS = /[̀-ͯ]/g

/** Bo dau tieng Viet (chi de SO SANH, khong dung de hien thi). */
export function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

/** Tu "co nghia" cua cau: bo dau, bo stopword, bo tu qua ngan. */
export function contentTokens(s: string): string[] {
  return stripDiacritics(s.toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !VI_STOPWORDS.has(w))
}

function charBigrams(s: string): Map<string, number> {
  const clean = stripDiacritics(s.toLowerCase()).replace(/[^a-z0-9]/g, '')
  const out = new Map<string, number>()
  for (let i = 0; i < clean.length - 1; i++) {
    const bg = clean.slice(i, i + 2)
    out.set(bg, (out.get(bg) ?? 0) + 1)
  }
  return out
}

/** He so Dice tren bigram ky tu (0..1). Bat loi go, dao chu, doi hau to. */
export function diceCoefficient(a: string, b: string): number {
  const bgA = charBigrams(a)
  const bgB = charBigrams(b)
  if (bgA.size === 0 || bgB.size === 0) return a === b ? 1 : 0
  let overlap = 0
  for (const [bg, countA] of bgA) {
    const countB = bgB.get(bg)
    if (countB) overlap += Math.min(countA, countB)
  }
  const totalA = [...bgA.values()].reduce((s, n) => s + n, 0)
  const totalB = [...bgB.values()].reduce((s, n) => s + n, 0)
  return (2 * overlap) / (totalA + totalB)
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let inter = 0
  for (const x of a) if (b.has(x)) inter += 1
  return inter / (a.size + b.size - inter)
}

/**
 * Do giong nhau tong hop giua 2 cau hoi (0..1). Ket hop:
 *  - Dice bigram ky tu (bat cach viet gan giong, loi go, doi hau to)
 *  - Jaccard tren tap tu co nghia (bat dao trat tu tu, cung bo khai niem)
 *
 * Tang tu vung nay bat duoc cau viet lai gan giong / dao chu; cau dien dat lai
 * hoan toan bang tu khac thi can `embedder` (tang nhung) moi bat duoc.
 */
export function lexicalSimilarity(a: string, b: string): number {
  const dice = diceCoefficient(a, b)
  const jac = jaccard(new Set(contentTokens(a)), new Set(contentTokens(b)))
  return 0.4 * dice + 0.6 * jac
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export type Embedder = (texts: string[]) => Promise<number[][] | null>

export interface SemanticDedupeOptions {
  /** Nguong giong nhau tu vung -> coi la trung. Mac dinh 0.82. */
  threshold?: number
  /** Nguong cosine tren vector nhung -> coi la trung. Mac dinh 0.88. */
  embedThreshold?: number
  /** Ham nhung (Ollama). Tra null neu that bai -> tu dong bo qua tang nay. */
  embedder?: Embedder
}

export interface SemanticDedupeResult {
  kept: DraftQuestion[]
  removed: number
  removedTexts: string[]
}

// Gioi han so cau cu dua vao so sanh (nhat la khi nhung) - lay cac cau moi nhat.
const MAX_REFERENCES = 300

/**
 * Loc bo candidate trung ngu nghia voi `existingTexts` (cau da co) VA trung nhau
 * trong chinh danh sach candidate. Giu thu tu dau vao.
 */
export async function filterSemanticDuplicates(
  candidates: DraftQuestion[],
  existingTexts: string[],
  options: SemanticDedupeOptions = {}
): Promise<SemanticDedupeResult> {
  const threshold = options.threshold ?? 0.72
  const embedThreshold = options.embedThreshold ?? 0.88

  if (candidates.length === 0) {
    return { kept: [], removed: 0, removedTexts: [] }
  }

  const references = existingTexts
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(-MAX_REFERENCES)

  // Nhung tat ca 1 luot (neu co embedder). candidate[i] -> candEmb[i];
  // reference[j] -> refEmb[j]. null => tang nhung bi bo.
  let candEmb: number[][] | null = null
  let refEmb: number[][] | null = null
  if (options.embedder) {
    try {
      const all = await options.embedder([
        ...candidates.map((q) => q.questionText),
        ...references
      ])
      if (all && all.length === candidates.length + references.length) {
        candEmb = all.slice(0, candidates.length)
        refEmb = all.slice(candidates.length)
      }
    } catch {
      candEmb = null
      refEmb = null
    }
  }

  const keptIdx: number[] = []
  const kept: DraftQuestion[] = []
  const removedTexts: string[] = []

  const exactRefKeys = new Set(references.map(normalizeQuestionText))

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i]
    const candText = cand.questionText
    const candKey = normalizeQuestionText(candText)

    let dup = exactRefKeys.has(candKey)

    // vs cac cau da co
    if (!dup) {
      for (let j = 0; j < references.length; j++) {
        if (lexicalSimilarity(candText, references[j]) >= threshold) {
          dup = true
          break
        }
        if (candEmb && refEmb && cosineSimilarity(candEmb[i], refEmb[j]) >= embedThreshold) {
          dup = true
          break
        }
      }
    }

    // vs cac candidate da giu
    if (!dup) {
      for (const k of keptIdx) {
        if (lexicalSimilarity(candText, candidates[k].questionText) >= threshold) {
          dup = true
          break
        }
        if (candEmb && cosineSimilarity(candEmb[i], candEmb[k]) >= embedThreshold) {
          dup = true
          break
        }
      }
    }

    if (dup) {
      removedTexts.push(candText)
    } else {
      keptIdx.push(i)
      kept.push(cand)
    }
  }

  return { kept, removed: removedTexts.length, removedTexts }
}
