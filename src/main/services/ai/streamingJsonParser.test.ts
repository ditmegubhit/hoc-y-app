import { describe, it, expect } from 'vitest'
import { extractArrayObjects, countCompleteQuestions } from './streamingJsonParser'

const full =
  '{"questions":[' +
  '{"question":"Câu 1?","options":["a","b","c","d"],"correct":0,"explanation":"vì a"},' +
  '{"question":"Câu 2?","options":["a","b","c","d"],"correct":1,"explanation":"vì b"}' +
  ']}'

describe('extractArrayObjects', () => {
  it('lay het object khi JSON day du', () => {
    expect(extractArrayObjects(full)).toHaveLength(2)
  })

  it('chi lay object da dong ngoac, bo object dang viet do', () => {
    const partial =
      '{"questions":[{"question":"Câu 1?","options":["a","b","c","d"],"correct":0,"explanation":"x"},{"question":"Câu 2 chưa xong'
    expect(countCompleteQuestions(partial)).toBe(1)
  })

  it('0 khi chua toi mang questions', () => {
    expect(countCompleteQuestions('{"quest')).toBe(0)
    expect(countCompleteQuestions('')).toBe(0)
  })

  it('khong bi nham dau ngoac trong chuoi', () => {
    const partial =
      '{"questions":[{"question":"Dấu } và ] trong câu?","options":["a{","b}","c]","d["],"correct":0}'
    expect(countCompleteQuestions(partial)).toBe(1)
  })

  it('xu ly ky tu escape trong chuoi', () => {
    const partial =
      '{"questions":[{"question":"Câu có \\"trích dẫn\\" và } ở trong","options":["a","b","c","d"],"correct":0}'
    expect(countCompleteQuestions(partial)).toBe(1)
  })

  it('dem tang dan khi chunk toi tiep', () => {
    const c1 = '{"questions":[{"question":"Q1","options":["a","b","c","d"],"correct":0}'
    const c2 = c1 + ',{"question":"Q2","options":["a","b","c","d"],"correct":1}'
    expect(countCompleteQuestions(c1)).toBe(1)
    expect(countCompleteQuestions(c2)).toBe(2)
  })
})
