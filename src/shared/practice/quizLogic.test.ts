import { describe, expect, it } from 'vitest'
import type { PracticeAttemptSummary, PracticeQuestionSummary } from '../types/practice'
import {
  applyTimePenalty,
  buildScoreSeries,
  effectiveSelection,
  formatDuration,
  formatScore,
  groupQuestionsByPage,
  isPassed,
  parseSqliteUtc,
  questionsInRange,
  scorePercent,
  stripIpcError,
  validateTimeLimit
} from './quizLogic'

const q = (id: string, pageNumber: number): PracticeQuestionSummary => ({ id, pageNumber, answerText: id })

describe('dinh dang', () => {
  it('formatDuration', () => {
    expect(formatDuration(45)).toBe('45 giây')
    expect(formatDuration(125)).toBe('2 phút 05 giây')
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(-1)).toBe('—')
  })

  it('formatScore dung dau phay, bo .0', () => {
    expect(formatScore(7.5)).toBe('7,5')
    expect(formatScore(10)).toBe('10')
    expect(formatScore(0)).toBe('0')
    expect(formatScore(6.666)).toBe('6,7')
  })

  it('scorePercent / isPassed', () => {
    expect(scorePercent(3, 4)).toBe(75)
    expect(scorePercent(0, 0)).toBe(0)
    expect(isPassed(4)).toBe(true)
    expect(isPassed(3.9)).toBe(false)
  })

  it('parseSqliteUtc coi chuoi khong co mui gio la UTC', () => {
    expect(parseSqliteUtc('2026-10-06 10:00:00').toISOString()).toBe('2026-10-06T10:00:00.000Z')
    expect(parseSqliteUtc('2026-10-06T10:00:00Z').toISOString()).toBe('2026-10-06T10:00:00.000Z')
  })

  it('stripIpcError bo tien to Electron', () => {
    expect(stripIpcError("Error invoking remote method 'practice:createStationSet': Error: Đề trống")).toBe('Đề trống')
    expect(stripIpcError('Lỗi thường')).toBe('Lỗi thường')
  })
})

describe('applyTimePenalty', () => {
  const base = { timeLimitMs: 30000, lastIndex: 2 }

  it('khong phat thi giu nguyen', () => {
    expect(applyTimePenalty({ ...base, index: 0, remainingMs: 10000, penaltyMs: 0 })).toEqual({
      index: 0, remainingMs: 10000, expiredIndices: []
    })
  })

  it('phat nho hon thoi gian con lai chi tru bot', () => {
    expect(applyTimePenalty({ ...base, index: 1, remainingMs: 10000, penaltyMs: 1000 })).toEqual({
      index: 1, remainingMs: 9000, expiredIndices: []
    })
  })

  it('phat lon hon thoi gian con lai: het gio, tru tiep sang cau ke', () => {
    expect(applyTimePenalty({ ...base, index: 0, remainingMs: 2000, penaltyMs: 3000 })).toEqual({
      index: 1, remainingMs: 29000, expiredIndices: [0]
    })
  })

  it('phat lon tran qua nhieu cau', () => {
    expect(applyTimePenalty({ ...base, index: 0, remainingMs: 1000, penaltyMs: 32000 })).toEqual({
      index: 2, remainingMs: 29000, expiredIndices: [0, 1]
    })
  })

  it('dang o cau cuoi ma het gio thi remaining = 0', () => {
    expect(applyTimePenalty({ ...base, index: 2, remainingMs: 1000, penaltyMs: 5000 })).toEqual({
      index: 2, remainingMs: 0, expiredIndices: [2]
    })
  })
})

describe('validateTimeLimit', () => {
  it('luyen tap cho phep 0..300', () => {
    expect(validateTimeLimit('practice', 0)).toBeNull()
    expect(validateTimeLimit('practice', 300)).toBeNull()
    expect(validateTimeLimit('practice', 301)).not.toBeNull()
    expect(validateTimeLimit('practice', -1)).not.toBeNull()
  })

  it('thi thu bat buoc 1..300', () => {
    expect(validateTimeLimit('exam', 0)).not.toBeNull()
    expect(validateTimeLimit('exam', 1)).toBeNull()
    expect(validateTimeLimit('exam', 300)).toBeNull()
    expect(validateTimeLimit('exam', 12.5)).not.toBeNull()
    expect(validateTimeLimit('exam', Number.NaN)).not.toBeNull()
  })
})

describe('chon cau', () => {
  const all = [q('a', 3), q('b', 1), q('c', 3), q('d', 2)]

  it('groupQuestionsByPage sap theo trang, giu thu tu trong trang', () => {
    const groups = groupQuestionsByPage(all)
    expect(groups.map((g) => g.pageNumber)).toEqual([1, 2, 3])
    expect(groups[2].questions.map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('questionsInRange', () => {
    expect(questionsInRange(all, 2, 3).map((x) => x.id)).toEqual(['a', 'c', 'd'])
    expect(questionsInRange(all, null, null)).toHaveLength(4)
    expect(questionsInRange(all, null, 1).map((x) => x.id)).toEqual(['b'])
  })

  it('effectiveSelection: giao cua khoang trang va tap tick tay', () => {
    expect(effectiveSelection(all, 2, 3, null)).toHaveLength(3)
    expect(effectiveSelection(all, 2, 3, new Set(['a', 'b'])).map((x) => x.id)).toEqual(['a'])
    expect(effectiveSelection(all, null, null, new Set())).toEqual([])
  })
})

describe('buildScoreSeries', () => {
  const layout = { width: 400, height: 200, padLeft: 20, padRight: 20, padTop: 10, padBottom: 30 }
  const item = (id: string, at: string, score: number, n: number): PracticeAttemptSummary => ({
    attemptId: id, stationSetName: 'Đề 1', attemptNumber: n, feedbackMode: 'exam',
    score, correctCount: 0, totalCount: 10, submittedAt: at
  })

  it('sap tang dan theo thoi gian va tinh toa do', () => {
    const points = buildScoreSeries(
      [item('late', '2026-10-06 10:00:00', 10, 2), item('early', '2026-10-05 10:00:00', 0, 1)],
      layout
    )
    expect(points.map((p) => p.attemptId)).toEqual(['early', 'late'])
    expect(points[0].x).toBe(20)
    expect(points[1].x).toBe(380)
    expect(points[0].y).toBe(170) // diem 0 nam o day vung ve
    expect(points[1].y).toBe(10) // diem 10 nam o dinh
  })

  it('1 diem nam giua', () => {
    const [point] = buildScoreSeries([item('x', '2026-10-06 10:00:00', 5, 1)], layout)
    expect(point.x).toBe(200)
    expect(point.y).toBe(90)
  })
})
