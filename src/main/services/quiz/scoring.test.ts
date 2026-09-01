import { describe, it, expect } from 'vitest'
import { computeAttemptResult } from './scoring'
import type { QuestionOption } from '../../../shared/types/question'

function opts(correctId: string): QuestionOption[] {
  return ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id.toUpperCase(), isCorrect: id === correctId }))
}

describe('computeAttemptResult', () => {
  it('cham dung diem thang 10', () => {
    const snapshot = new Map([
      ['q1', { options: opts('a') }],
      ['q2', { options: opts('b') }],
      ['q3', { options: opts('c') }],
      ['q4', { options: opts('d') }]
    ])
    const res = computeAttemptResult(snapshot, [
      { quizQuestionId: 'q1', selectedOptionId: 'a' },
      { quizQuestionId: 'q2', selectedOptionId: 'b' },
      { quizQuestionId: 'q3', selectedOptionId: 'a' },
      { quizQuestionId: 'q4', selectedOptionId: null }
    ])
    expect(res.correctCount).toBe(2)
    expect(res.totalCount).toBe(4)
    expect(res.score).toBe(5)
  })

  it('cau khong tra loi tinh la sai', () => {
    const snapshot = new Map([['q1', { options: opts('a') }]])
    const res = computeAttemptResult(snapshot, [])
    expect(res.correctCount).toBe(0)
    expect(res.score).toBe(0)
  })

  it('cau du lieu hong (khong co dap an dung) khong bao gio dung', () => {
    const snapshot = new Map([['q1', { options: opts('zzz') }]])
    const res = computeAttemptResult(snapshot, [{ quizQuestionId: 'q1', selectedOptionId: 'a' }])
    expect(res.correctCount).toBe(0)
    expect(res.perAnswer[0].isCorrect).toBe(false)
  })

  it('lam tron 1 chu so thap phan', () => {
    const snapshot = new Map([
      ['q1', { options: opts('a') }],
      ['q2', { options: opts('a') }],
      ['q3', { options: opts('a') }]
    ])
    const res = computeAttemptResult(snapshot, [{ quizQuestionId: 'q1', selectedOptionId: 'a' }])
    // 1/3 * 10 = 3.333 -> 3.3
    expect(res.score).toBe(3.3)
  })

  it('snapshot rong -> diem 0', () => {
    const res = computeAttemptResult(new Map(), [])
    expect(res.score).toBe(0)
    expect(res.totalCount).toBe(0)
  })
})
