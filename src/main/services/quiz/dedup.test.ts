import { describe, it, expect } from 'vitest'
import { normalizeQuestionText, dedupeQuestions } from './dedup'
import type { DraftQuestion } from '../../../shared/types/question'

function q(text: string): DraftQuestion {
  return {
    questionText: text,
    options: [
      { id: 'a', text: 'A', isCorrect: true },
      { id: 'b', text: 'B', isCorrect: false },
      { id: 'c', text: 'C', isCorrect: false },
      { id: 'd', text: 'D', isCorrect: false }
    ],
    explanation: null
  }
}

describe('normalizeQuestionText', () => {
  it('gom khoang trang, thuong hoa, bo dau cau cuoi', () => {
    expect(normalizeQuestionText('  Phế  nang làm GÌ?  ')).toBe('phế nang làm gì')
  })

  it('giu nguyen dau tieng Viet', () => {
    expect(normalizeQuestionText('Số ít')).not.toBe(normalizeQuestionText('So it'))
  })
})

describe('dedupeQuestions', () => {
  it('bo cau trung voi ngan hang hien co (khop gan y het)', () => {
    const res = dedupeQuestions([q('Phế nang làm gì?'), q('Chức năng của gan')], [
      'phế nang làm gì'
    ])
    expect(res.kept).toHaveLength(1)
    expect(res.removed).toBe(1)
    expect(res.kept[0].questionText).toBe('Chức năng của gan')
  })

  it('bo cau trung nhau trong cung batch', () => {
    const res = dedupeQuestions([q('Chức năng gan'), q('chức năng gan.')], [])
    expect(res.kept).toHaveLength(1)
    expect(res.removed).toBe(1)
  })

  it('bo cau rong', () => {
    const res = dedupeQuestions([q('   ')], [])
    expect(res.kept).toHaveLength(0)
    expect(res.removed).toBe(1)
  })

  it('giu lai khi khong trung', () => {
    const res = dedupeQuestions([q('Câu 1'), q('Câu 2'), q('Câu 3')], ['câu khác'])
    expect(res.kept).toHaveLength(3)
    expect(res.removed).toBe(0)
  })
})
