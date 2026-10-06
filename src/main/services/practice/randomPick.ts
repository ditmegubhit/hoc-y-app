// Chon / xao cau hoi ngau nhien. Ham thuan tuy: nhan rng de test duoc.

export type Rng = () => number

/** Xao tron Fisher-Yates, KHONG sua mang goc. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export interface PickableQuestion {
  id: string
  pageNumber: number
}

export interface PickOptions {
  count: number
  fromPage: number
  toPage: number
}

/**
 * Chon ngau nhien toi da `count` cau trong khoang trang [fromPage, toPage]
 * (bao gom 2 dau). Ket qua giu thu tu goc cua danh sach dau vao (theo trang)
 * de UI tick san dep mat; luc lam bai se xao lai.
 */
export function pickRandomQuestionIds(
  questions: readonly PickableQuestion[],
  options: PickOptions,
  rng: Rng = Math.random
): string[] {
  const lo = Math.min(options.fromPage, options.toPage)
  const hi = Math.max(options.fromPage, options.toPage)
  const pool = questions.filter((q) => q.pageNumber >= lo && q.pageNumber <= hi)
  const count = Math.max(0, Math.min(Math.floor(options.count), pool.length))
  if (count === 0) return []
  const chosen = new Set(shuffle(pool, rng).slice(0, count).map((q) => q.id))
  return pool.filter((q) => chosen.has(q.id)).map((q) => q.id)
}
