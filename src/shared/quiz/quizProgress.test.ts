import { describe, it, expect } from 'vitest'
import {
  formatClock,
  deriveCells,
  summarizeProgress,
  filterAnswers,
  type QuizCell
} from './quizProgress'
import type { AttemptAnswerReview } from '../types/quiz'

describe('formatClock', () => {
  it('mm:ss khi < 1 gio', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(59)).toBe('00:59')
    expect(formatClock(60)).toBe('01:00')
    expect(formatClock(3599)).toBe('59:59')
  })
  it('h:mm:ss khi >= 1 gio', () => {
    expect(formatClock(3600)).toBe('1:00:00')
    expect(formatClock(3661)).toBe('1:01:01')
  })
  it('am / khong hop le -> 0, lam tron xuong', () => {
    expect(formatClock(-5)).toBe('00:00')
    expect(formatClock(NaN)).toBe('00:00')
    expect(formatClock(90.9)).toBe('01:30')
  })
})

describe('deriveCells', () => {
  it('danh dau answered/flagged/current doc lap', () => {
    const cells = deriveCells({
      orderedIds: ['a', 'b', 'c'],
      currentIndex: 1,
      answeredIds: new Set(['a', 'b']),
      flaggedIds: new Set(['b'])
    })
    expect(cells[0]).toEqual({ index: 0, quizQuestionId: 'a', answered: true, flagged: false, current: false })
    expect(cells[1]).toEqual({ index: 1, quizQuestionId: 'b', answered: true, flagged: true, current: true })
    expect(cells[2]).toEqual({ index: 2, quizQuestionId: 'c', answered: false, flagged: false, current: false })
  })
})

describe('summarizeProgress', () => {
  const mk = (over: Partial<QuizCell>[]): QuizCell[] =>
    over.map((o, i) => ({ index: i, quizQuestionId: `q${i}`, answered: false, flagged: false, current: false, ...o }))

  it('dem + mang index', () => {
    const s = summarizeProgress(mk([{ answered: true }, {}, { flagged: true }, { answered: true, flagged: true }]))
    expect(s.total).toBe(4)
    expect(s.answeredCount).toBe(2)
    expect(s.unansweredCount).toBe(2)
    expect(s.flaggedCount).toBe(2)
    expect(s.unansweredIndexes).toEqual([1, 2])
    expect(s.flaggedIndexes).toEqual([2, 3])
  })
  it('tra loi het', () => {
    const s = summarizeProgress(mk([{ answered: true }, { answered: true }]))
    expect(s.unansweredCount).toBe(0)
    expect(s.unansweredIndexes).toEqual([])
  })
  it('rong', () => {
    const s = summarizeProgress([])
    expect(s).toEqual({ total: 0, answeredCount: 0, unansweredCount: 0, flaggedCount: 0, unansweredIndexes: [], flaggedIndexes: [] })
  })
})

describe('filterAnswers', () => {
  const a = (over: Partial<AttemptAnswerReview>): AttemptAnswerReview => ({
    quizQuestionId: 'q',
    questionText: '',
    options: [],
    explanation: null,
    selectedOptionId: 'x',
    correctOptionId: 'x',
    isCorrect: true,
    flagged: false,
    ...over
  })
  const list = [
    a({ quizQuestionId: '1', isCorrect: true }),
    a({ quizQuestionId: '2', isCorrect: false }),
    a({ quizQuestionId: '3', isCorrect: false, selectedOptionId: null }),
    a({ quizQuestionId: '4', isCorrect: true, flagged: true })
  ]

  it('all -> nguyen ban', () => {
    expect(filterAnswers(list, 'all')).toHaveLength(4)
  })
  it('wrong', () => {
    expect(filterAnswers(list, 'wrong').map((x) => x.quizQuestionId)).toEqual(['2', '3'])
  })
  it('flagged', () => {
    expect(filterAnswers(list, 'flagged').map((x) => x.quizQuestionId)).toEqual(['4'])
  })
  it('skipped (chua chon)', () => {
    expect(filterAnswers(list, 'skipped').map((x) => x.quizQuestionId)).toEqual(['3'])
  })
})
