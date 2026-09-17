import { describe, it, expect } from 'vitest'
import { computeAnatomyAnswerResult } from './grading'

describe('computeAnatomyAnswerResult', () => {
  it('khop chinh xac dap an dung', () => {
    const res = computeAnatomyAnswerResult(
      { answerText: 'Niệu quản', acceptedAlternates: [] },
      'Niệu quản'
    )
    expect(res.isCorrect).toBe(true)
  })

  it('khop gan dung: khong dau, khac hoa thuong, khoang trang thua', () => {
    const res = computeAnatomyAnswerResult(
      { answerText: 'Niệu quản', acceptedAlternates: [] },
      '  nieu QUAN  '
    )
    expect(res.isCorrect).toBe(true)
  })

  it('khop dap an chap nhan duoc (accepted alternates)', () => {
    const res = computeAnatomyAnswerResult(
      { answerText: 'Bể thận', acceptedAlternates: ['Xoang thận', 'Bể thận đoạn trên'] },
      'xoang than'
    )
    expect(res.isCorrect).toBe(true)
  })

  it('cau tra loi khong lien quan thi sai', () => {
    const res = computeAnatomyAnswerResult(
      { answerText: 'Niệu quản', acceptedAlternates: ['Niệu quản đoạn bụng'] },
      'Bàng quang'
    )
    expect(res.isCorrect).toBe(false)
  })

  it('cau tra loi rong thi sai', () => {
    const res = computeAnatomyAnswerResult({ answerText: 'Niệu quản', acceptedAlternates: [] }, '')
    expect(res.isCorrect).toBe(false)
  })
})
