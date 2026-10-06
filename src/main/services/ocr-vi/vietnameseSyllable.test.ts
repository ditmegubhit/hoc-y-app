import { describe, expect, it } from 'vitest'
import {
  classifyToken, isPlainVietnameseSyllable, isValidVietnameseSyllable, scoreVietnameseText
} from './vietnameseSyllable'

describe('isValidVietnameseSyllable', () => {
  it.each(['thận', 'thượng', 'buồng', 'trứng', 'trái', 'tinh', 'hoàn', 'cung', 'khẩu', 'cái', 'hầu', 'lưỡi', 'gà', 'cơ', 'cằm',
    'móng', 'THẬN', 'LƯỠI', 'CẰM', 'ngoài', 'quản', 'niệu', 'đạo', 'bàng', 'quang', 'tiền', 'liệt', 'thùy', 'thủy', 'hoà', 'hòa',
    'nghiêng', 'gì', 'xương', 'chậu', 'ĐẠO'])('accepts %s', (word) => expect(isValidVietnameseSyllable(word)).toBe(true))

  it.each(['ượ', 'ậ', 'Ẩ', 'ng', 'th', 'xyz', 'thậnn', 'qư', 'kăm', 'tac', 'tách ', '1a'])('rejects %s', (word) => {
    expect(isValidVietnameseSyllable(word)).toBe(false)
  })

  it('requires acute or dot tone after stop codas', () => {
    expect(isValidVietnameseSyllable('tát')).toBe(true)
    expect(isValidVietnameseSyllable('tạt')).toBe(true)
    expect(isValidVietnameseSyllable('tàt')).toBe(false)
    expect(isValidVietnameseSyllable('tat')).toBe(false)
  })

  it('rejects tone marks sitting on consonants or doubled tones', () => {
    expect(isValidVietnameseSyllable('tḥan')).toBe(false)
    expect(isValidVietnameseSyllable('thậ́n')).toBe(false)
  })
})

describe('isPlainVietnameseSyllable', () => {
  it.each(['tinh', 'hoan', 'thuong', 'than', 'quang'])('accepts %s', (w) => expect(isPlainVietnameseSyllable(w)).toBe(true))
  it.each(['th', 'ng', 'zzz', 'thậnh'])('rejects %s', (w) => expect(isPlainVietnameseSyllable(w)).toBe(false))
})

describe('classifyToken', () => {
  it('classifies abbreviations, numbers and uppercase codes', () => {
    expect(classifyToken('ĐM')).toBe('abbr')
    expect(classifyToken('TM')).toBe('abbr')
    expect(classifyToken('TC')).toBe('abbr')
    expect(classifyToken('12')).toBe('number')
    expect(classifyToken('thận')).toBe('valid')
    expect(classifyToken('xk')).toBe('invalid')
  })
})

describe('scoreVietnameseText', () => {
  it('scores clean labels high', () => {
    for (const text of ['tm thượng thận trái', 'ĐM thận T', 'CUNG KHẨU CÁI HẦU', 'Ống lượn gần', 'tm tinh hoàn/buồng trứng']) {
      const score = scoreVietnameseText(text)
      expect(score.ratio).toBeGreaterThanOrEqual(0.99)
      expect(score.fragmented).toBe(false)
    }
  })

  it('detects split syllables from a broken text layer', () => {
    const score = scoreVietnameseText('tm th ượ ng th ậ n trái')
    expect(score.fragmented).toBe(true)
    expect(score.ratio).toBeLessThan(0.75)
  })

  it('flags OCR garbage', () => {
    expect(scoreVietnameseText('AM fines hocu').ratio).toBeLessThan(0.75)
    expect(scoreVietnameseText('').tokens).toBe(0)
  })
})
