import { describe, expect, it } from 'vitest'
import { pickRandomQuestionIds, shuffle } from './randomPick'

const questions = Array.from({ length: 20 }, (_, i) => ({ id: `q${i + 1}`, pageNumber: Math.floor(i / 4) + 1 }))

// rng xac dinh de test lap lai duoc
function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('shuffle', () => {
  it('giu nguyen tap phan tu, khong sua mang goc', () => {
    const input = [1, 2, 3, 4, 5, 6]
    const out = shuffle(input, seeded(1))
    expect([...out].sort()).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('pickRandomQuestionIds', () => {
  it('chi chon trong khoang trang va dung so luong', () => {
    const ids = pickRandomQuestionIds(questions, { count: 5, fromPage: 2, toPage: 3 }, seeded(7))
    expect(ids).toHaveLength(5)
    for (const id of ids) {
      const q = questions.find((x) => x.id === id)!
      expect(q.pageNumber).toBeGreaterThanOrEqual(2)
      expect(q.pageNumber).toBeLessThanOrEqual(3)
    }
    expect(new Set(ids).size).toBe(5)
  })

  it('count lon hon so cau co san thi lay het; count 0 thi rong', () => {
    expect(pickRandomQuestionIds(questions, { count: 99, fromPage: 1, toPage: 1 })).toEqual(['q1', 'q2', 'q3', 'q4'])
    expect(pickRandomQuestionIds(questions, { count: 0, fromPage: 1, toPage: 5 })).toEqual([])
  })

  it('giu thu tu goc (theo trang) trong ket qua', () => {
    const ids = pickRandomQuestionIds(questions, { count: 8, fromPage: 1, toPage: 5 }, seeded(3))
    const positions = ids.map((id) => questions.findIndex((q) => q.id === id))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('khoang trang bi dao nguoc van dung', () => {
    expect(pickRandomQuestionIds(questions, { count: 10, fromPage: 2, toPage: 1 })).toHaveLength(8)
  })

  it('rng khac nhau cho tap chon khac nhau', () => {
    const a = pickRandomQuestionIds(questions, { count: 5, fromPage: 1, toPage: 5 }, seeded(1))
    const b = pickRandomQuestionIds(questions, { count: 5, fromPage: 1, toPage: 5 }, seeded(2))
    expect(a).not.toEqual(b)
  })
})
