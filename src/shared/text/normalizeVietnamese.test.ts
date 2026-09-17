import { describe, it, expect } from 'vitest'
import { stripDiacritics, normalizeForAnswerMatch } from './normalizeVietnamese'

describe('stripDiacritics', () => {
  it('bo dau tieng Viet, giu chu thuong', () => {
    expect(stripDiacritics('Niệu quản')).toBe('Nieu quan')
  })

  it('xu ly dung d/D co gach ngang', () => {
    expect(stripDiacritics('Đáy bàng quang')).toBe('Day bang quang')
  })
})

describe('normalizeForAnswerMatch', () => {
  it('coi cau tra loi dung dau va khong dau la giong nhau', () => {
    expect(normalizeForAnswerMatch('Niệu quản')).toBe(normalizeForAnswerMatch('nieu quan'))
  })

  it('khong phan biet hoa thuong', () => {
    expect(normalizeForAnswerMatch('BÀNG QUANG')).toBe(normalizeForAnswerMatch('bàng quang'))
  })

  it('gop khoang trang thua va cat khoang trang dau/cuoi', () => {
    expect(normalizeForAnswerMatch('  Bể   thận  ')).toBe(normalizeForAnswerMatch('Bể thận'))
  })

  it('hai cau khac nghia thi khong khop', () => {
    expect(normalizeForAnswerMatch('Niệu quản')).not.toBe(normalizeForAnswerMatch('Bàng quang'))
  })
})
