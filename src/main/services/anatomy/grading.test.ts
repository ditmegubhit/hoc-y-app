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

  it('khong phan biet hoa thuong va khoang trang thua, nhung van giu dau', () => {
    const res = computeAnatomyAnswerResult(
      { answerText: 'Niệu quản', acceptedAlternates: [] },
      '  NIỆU QUẢN  '
    )
    expect(res.isCorrect).toBe(true)
  })

  it('khong chap nhan cau tra loi mat dau', () => {
    expect(computeAnatomyAnswerResult(
      { answerText: 'Niệu quản', acceptedAlternates: [] },
      'nieu quan'
    ).isCorrect).toBe(false)
  })

  it('mo rong viet tat y khoa va bo gach ngang', () => {
    expect(computeAnatomyAnswerResult(
      { answerText: 'Động mạch thận', acceptedAlternates: [] },
      'ĐM-thận'
    ).isCorrect).toBe(true)
  })

  it('khop dap an chap nhan duoc (accepted alternates)', () => {
    const res = computeAnatomyAnswerResult(
      { answerText: 'Bể thận', acceptedAlternates: ['Xoang thận', 'Bể thận đoạn trên'] },
      'xoang thận'
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

  it('chap nhan doi cho cum "phan/doan + tu" giua dau va cuoi', () => {
    const q = { answerText: 'Tá tràng phần xuống', acceptedAlternates: [] }
    expect(computeAnatomyAnswerResult(q, 'Phần xuống tá tràng').isCorrect).toBe(true)
    expect(computeAnatomyAnswerResult({ answerText: 'Phần xuống tá tràng', acceptedAlternates: [] }, 'tá tràng phần xuống').isCorrect).toBe(true)
    expect(computeAnatomyAnswerResult({ answerText: 'Niệu quản đoạn bụng', acceptedAlternates: [] }, 'đoạn bụng niệu quản').isCorrect).toBe(true)
  })

  it('doi cho khong lam doi nghia: sai phan thi van sai', () => {
    const q = { answerText: 'Tá tràng phần xuống', acceptedAlternates: [] }
    expect(computeAnatomyAnswerResult(q, 'Phần ngang tá tràng').isCorrect).toBe(false)
    expect(computeAnatomyAnswerResult(q, 'xuống tràng tá phần').isCorrect).toBe(false)
    expect(computeAnatomyAnswerResult(q, 'phần xuống').isCorrect).toBe(false)
  })

  it('cau tra loi rong thi sai', () => {
    const res = computeAnatomyAnswerResult({ answerText: 'Niệu quản', acceptedAlternates: [] }, '')
    expect(res.isCorrect).toBe(false)
  })
})
