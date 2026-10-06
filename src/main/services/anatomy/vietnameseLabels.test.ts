import { describe, expect, it } from 'vitest'
import {
  builtinTermCount, canonicalizeTerm, expandTermVariants, isKnownTerm, learnTermsFromAnswers, matchCase,
  normalizeLabel, suggestVietnameseLabel
} from './vietnameseLabels'

describe('Vietnamese anatomy spelling suggestions', () => {
  it.each([['Bangquang', 'Bàng quang'], ['Nieu quan T', 'Niệu quản T'], ['DMthanT', 'ĐM thận T'],
    ['Congoihang', 'Cơ ngồi hang'], ['Tuyen tien liet', 'Tuyến tiền liệt'], ['Niệu quan', 'Niệu quản']])
    ('restores unique term %s', (raw, expected) => expect(suggestVietnameseLabel(raw)).toBe(expected))
  it.each(['mat', 'than', 'xyzabc', 'Bàng quang', 'Mạt'])('keeps ambiguous/unknown/already correct %s', (raw) => {
    expect(suggestVietnameseLabel(raw)).toBeNull()
  })
  it('preserves a conflicting accent rather than replacing one valid spelling with another', () => {
    expect(suggestVietnameseLabel('Niéu quản')).toBeNull()
  })
  it('normalizes wrapped Unicode text', () => expect(normalizeLabel('  Niệu\n  quản  ')).toBe('Niệu quản'))
})

describe('expanded anatomy dictionary', () => {
  it('covers regions beyond urinary/genital', () => {
    expect(builtinTermCount()).toBeGreaterThan(500)
    expect(suggestVietnameseLabel('Co cam luoi')).toBe('Cơ cằm lưỡi')
    expect(suggestVietnameseLabel('Xuong ham duoi')).toBe('Xương hàm dưới')
    expect(suggestVietnameseLabel('Tam that trai')).toBe('Tâm thất trái')
    expect(suggestVietnameseLabel('Ong mat chu')).toBe('Ống mật chủ')
    expect(suggestVietnameseLabel('Co nhi dau canh tay')).toBe('Cơ nhị đầu cánh tay')
  })

  it('expands abbreviations and sides automatically', () => {
    expect(expandTermVariants('Động mạch thận')).toEqual(expect.arrayContaining(['ĐM thận', 'ĐM thận T', 'Động mạch thận phải']))
    expect(suggestVietnameseLabel('DM than T')).toBe('ĐM thận T')
    expect(suggestVietnameseLabel('ĐM gan chung')).toBeNull() // da dung
    expect(suggestVietnameseLabel('DM gan rieng')).toBe('ĐM gan riêng')
  })

  it('adapts case to the OCR text', () => {
    expect(suggestVietnameseLabel('CO CAM LUOI')).toBe('CƠ CẰM LƯỠI')
    expect(suggestVietnameseLabel('co cam luoi')).toBe('cơ cằm lưỡi')
    expect(suggestVietnameseLabel('dm gan rieng')).toBe('ĐM gan riêng')
    expect(matchCase('Thận', 'Thận')).toBe('Thận')
  })

  it('does not rewrite an already correct accent in a different case', () => {
    expect(suggestVietnameseLabel('CƠ CẰM LƯỠI')).toBeNull()
    expect(suggestVietnameseLabel('CƠ CẰM LƯỜI')).toBeNull()
  })

  it('does nothing when only case or punctuation differ', () => {
    expect(suggestVietnameseLabel('tm tinh hoàn/')).toBeNull()
    expect(suggestVietnameseLabel('BÀNG QUANG')).toBeNull()
  })

  it('recognizes known terms exactly', () => {
    expect(isKnownTerm('CƠ CẰM LƯỠI')).toBe(true)
    expect(isKnownTerm('cơ cằm lười')).toBe(false)
    expect(isKnownTerm('ĐM thận P')).toBe(true)
    expect(isKnownTerm('a')).toBe(false)
  })
})

describe('learning from approved answers', () => {
  it('canonicalizes answers keeping abbreviations', () => {
    expect(canonicalizeTerm('CƠ CẰM LƯỠI')).toBe('Cơ cằm lưỡi')
    expect(canonicalizeTerm('đm thận T')).toBe('ĐM thận T')
    expect(canonicalizeTerm('TM chủ DƯỚI')).toBe('TM chủ dưới')
  })

  it('learns frequent, Vietnamese-looking answers and drops junk', () => {
    const learned = learnTermsFromAnswers(['Gờ vòi', 'GỜ VÒI', 'gờ vòi', 'xx', 'zzz qqq', 'tm th ượ ng', 'Nhú tá bé', ''])
    expect(learned[0]).toEqual({ term: 'Gờ vòi', count: 3 })
    expect(learned.map((l) => l.term)).toContain('Nhú tá bé')
    expect(learned.map((l) => l.term)).not.toContain('Zzz qqq')
    expect(learned.map((l) => l.term).join('|')).not.toContain('ượ')
  })

  it('learned terms feed suggestVietnameseLabel and respect uniqueness', () => {
    const extra = ['Hố hạnh nhân phụ']
    expect(suggestVietnameseLabel('Ho hanh nhan phu', extra)).toBe('Hố hạnh nhân phụ')
    expect(suggestVietnameseLabel('Ho hanh nhan phu')).toBeNull()
    // them dap an dong khoa nhung khac dau -> mo ho -> khong sua
    expect(suggestVietnameseLabel('Ho hanh nhan phu', ['Hố hạnh nhân phụ', 'Hồ hạnh nhân phụ'])).toBeNull()
  })
})
