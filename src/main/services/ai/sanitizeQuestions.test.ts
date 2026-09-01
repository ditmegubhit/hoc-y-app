import { describe, it, expect } from 'vitest'
import { sanitizeQuestions } from './sanitizeQuestions'
import type { DraftQuestion } from '../../../shared/types/question'

function make(over: Partial<DraftQuestion> & { opts?: [string, boolean][] }): DraftQuestion {
  const opts = over.opts ?? [
    ['Đáp án đúng', true],
    ['Nhiễu 1', false],
    ['Nhiễu 2', false],
    ['Nhiễu 3', false]
  ]
  return {
    questionText: over.questionText ?? 'Đây là một câu hỏi hợp lệ về sinh lý?',
    options: opts.map(([text, isCorrect], i) => ({
      id: String.fromCharCode(97 + i),
      text,
      isCorrect
    })),
    explanation: over.explanation ?? null
  }
}

describe('sanitizeQuestions', () => {
  it('giu cau hop le', () => {
    const res = sanitizeQuestions([make({})])
    expect(res.kept).toHaveLength(1)
    expect(res.dropped).toBe(0)
  })

  it('bo cau qua ngan', () => {
    const res = sanitizeQuestions([make({ questionText: 'Ngắn' })])
    expect(res.kept).toHaveLength(0)
    expect(res.dropped).toBe(1)
  })

  it('bo cau khong co dap an dung', () => {
    const res = sanitizeQuestions([
      make({
        opts: [
          ['A', false],
          ['B', false],
          ['C', false],
          ['D', false]
        ]
      })
    ])
    expect(res.kept).toHaveLength(0)
  })

  it('bo cau co nhieu hon mot dap an dung', () => {
    const res = sanitizeQuestions([
      make({
        opts: [
          ['A', true],
          ['B', true],
          ['C', false],
          ['D', false]
        ]
      })
    ])
    expect(res.kept).toHaveLength(0)
  })

  it('bo phuong an trung nhau, con < 3 -> loai ca cau', () => {
    const res = sanitizeQuestions([
      make({
        opts: [
          ['Giống nhau', true],
          ['giống nhau', false],
          ['giống  nhau', false],
          ['Khác', false]
        ]
      })
    ])
    // Con lai "Giống nhau" + "Khác" = 2 phuong an -> loai
    expect(res.kept).toHaveLength(0)
  })

  it('loai phuong an trung noi dung cau hoi', () => {
    const res = sanitizeQuestions([
      make({
        questionText: 'Thủ đô của Việt Nam là thành phố nào?',
        opts: [
          ['Hà Nội', true],
          ['Thủ đô của Việt Nam là thành phố nào', false],
          ['TP Hồ Chí Minh', false],
          ['Đà Nẵng', false]
        ]
      })
    ])
    // phuong an trung cau hoi bi bo -> con 3 -> van giu
    expect(res.kept).toHaveLength(1)
    expect(res.kept[0].options).toHaveLength(3)
  })

  it('chuan hoa lai id theo vi tri', () => {
    const res = sanitizeQuestions([make({})])
    expect(res.kept[0].options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})
