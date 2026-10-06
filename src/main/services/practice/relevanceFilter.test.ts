import { describe, expect, it } from 'vitest'
import { assessAnatomyRelevance } from './relevanceFilter'

const keep = (text: string, leaderScore: number | null = 0): void => {
  expect(assessAnatomyRelevance({ text, leaderScore }).relevant, text).toBe(true)
}
const drop = (text: string, leaderScore: number | null, reason: string): void => {
  const verdict = assessAnatomyRelevance({ text, leaderScore })
  expect(verdict.relevant, text).toBe(false)
  expect(verdict.reason, text).toBe(reason)
}

describe('assessAnatomyRelevance', () => {
  it('giu nhan giai phau, ke ca khong co duong dan', () => {
    keep('Niệu quản T')
    keep('CUNG KHẨU CÁI HẦU')
    keep('Phần dưới da')
    keep('Nieu quan trai')
  })

  it('giu quy tac viet tat DM/TM/DC/TK', () => {
    keep('ĐM thận T')
    keep('TM thận P')
    keep('TK trụ')
    keep('DC tròn tử cung')
  })

  it('giu dot song va nhan co duong dan du chua co trong tu dien', () => {
    keep('T12')
    keep('xyzabc', 0.9)
    keep('K2A', 0.99)
  })

  it('loai so/ky hieu khong co duong dan', () => {
    drop('35', 0, 'numeric-no-leader')
    drop('E', null, 'numeric-no-leader')
    keep('35', 0.8)
  })

  it('loai ma trang/hinh, email, ngay thang, cau van xuoi', () => {
    drop('GP47', 0.9, 'page-or-figure-code')
    drop('Hình 12', 0.9, 'page-or-figure-code')
    drop('nguyenvana@gmail.com', 0.9, 'contact-or-date')
    drop('Thời gian 2010-2015', 0.9, 'contact-or-date')
    drop('Đây là một phần của bài giảng và được trình bày', 0.9, 'prose')
  })

  it('so thap phan trong nhan khong bi coi la ngay thang', () => {
    keep('QUẢI PHẢI 2.5', 0.96)
  })

  it('loai chu khong co thu ngu giai phau va khong co duong dan', () => {
    drop('THÙY LINH YA', 0, 'no-anatomy-no-leader')
    drop('hoalachlienquan', 0.38, 'no-anatomy-no-leader')
  })

  it('dung them thuat ngu tu hoc', () => {
    expect(assessAnatomyRelevance({ text: 'Gờ vòi', leaderScore: 0 }, { additionalTerms: ['Gờ vòi'] }).relevant).toBe(true)
  })
})

describe('assessAnatomyRelevance - che do chat cho vung nghi rac', () => {
  const strict = (text: string, leaderScore = 0): boolean =>
    assessAnatomyRelevance({ text, leaderScore }, { strict: true }).relevant

  it('giu thuat ngu giai phau day du du khong co duong dan', () => {
    expect(strict('DẠ DÀY')).toBe(true)
    expect(strict('ỐNG TỤY CHÍNH')).toBe(true)
    expect(strict('MANH TRÀNG')).toBe(true)
  })

  it('loai manh ngan/so/rac du co duong dan manh', () => {
    expect(strict('37', 0.98)).toBe(false)
    expect(strict('NA', 0.96)).toBe(false)
    expect(strict('a', 0.88)).toBe(false)
    expect(strict('một', 0.82)).toBe(false)
    expect(strict('CTHANH PHO HO CHi MINH')).toBe(false)
  })
})

describe('assessAnatomyRelevance - che do chat dung do tin cay OCR', () => {
  it('giu nhan dai co duong dan manh va OCR chac', () => {
    const v = assessAnatomyRelevance(
      { text: 'TM VỊ MẠC NỐI PHẢI OR TM TÁ TỤY DƯỚI TRƯỚC', leaderScore: 1, confidence: 0.99 }, { strict: true })
    expect(v.relevant).toBe(true)
  })

  it('loai vung nghi rac co OCR doc kem', () => {
    const v = assessAnatomyRelevance({ text: 'BIẾT TRẰNG LÊN', leaderScore: 0.95, confidence: 0.51 }, { strict: true })
    expect(v.relevant).toBe(false)
  })
})
