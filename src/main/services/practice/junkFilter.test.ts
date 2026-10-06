import { describe, it, expect } from 'vitest'
import {
  classifyJunk, findContentRect, isLongNote, isPageCodeText, markRepeatedAcrossPages, RepeatTracker,
  type JunkInput, type JunkPageGeometry
} from './junkFilter'

const page: JunkPageGeometry = { width: 1000, height: 1400, contentRect: { x0: 100, y0: 100, x1: 900, y1: 1000 } }
const good: JunkInput = {
  text: 'Cơ nâng hậu môn', box: { x0: 400, y0: 500, x1: 560, y1: 530 }, confidence: 0.9,
  hasLeader: true, leaderEndpoint: { x: 450, y: 700 }, boxed: true, inkRatio: 0
}

describe('classifyJunk', () => {
  it('nhan tot: khong nghi rac', () => {
    const v = classifyJunk(good, page)
    expect(v.suspect).toBe(false)
    expect(v.reasons).toEqual([])
  })

  it('khong co duong dan -> nghi rac', () => {
    expect(classifyJunk({ ...good, hasLeader: false, leaderEndpoint: null }, page).codes).toContain('no-leader')
  })

  it('chu ky duoi anh: ngoai vung anh + khong duong dan', () => {
    const v = classifyJunk({
      ...good, text: 'THÙY LINH _YA', box: { x0: 100, y0: 1100, x1: 300, y1: 1130 }, hasLeader: false, leaderEndpoint: null
    }, page)
    expect(v.codes).toEqual(expect.arrayContaining(['no-leader', 'outside-image']))
  })

  it('hop tran ra le nhung duong dan cham vao anh van hop le', () => {
    const v = classifyJunk({ ...good, box: { x0: 20, y0: 500, x1: 150, y1: 530 } }, page)
    expect(v.codes).not.toContain('outside-image')
  })

  it('sat mep tren/duoi chi nghi khi khong co duong dan', () => {
    const top = { ...good, box: { x0: 400, y0: 10, x1: 560, y1: 40 } }
    expect(classifyJunk(top, page).codes).not.toContain('edge')
    expect(classifyJunk({ ...top, hasLeader: false, leaderEndpoint: null }, page).codes).toContain('edge')
  })

  it('ma bai/so trang', () => {
    expect(classifyJunk({ ...good, text: 'GP 12' }, page).codes).toContain('page-code')
    expect(isPageCodeText('12')).toBe(true)
    expect(isPageCodeText('trang 5')).toBe(true)
    expect(isPageCodeText('Niệu quản')).toBe(false)
  })

  it('ghi chu dai nhieu cau / co dau hai cham', () => {
    expect(isLongNote('Cơ ngồi hang : bọc lấy vật hang')).toBe(true)
    expect(isLongNote('Đây là câu một. Đây là câu hai. Câu ba.')).toBe(true)
    expect(isLongNote('ĐR TM trước bàng quang, ĐM dưới bàng quang')).toBe(false)
    expect(classifyJunk({ ...good, text: 'một hai ba bốn năm sáu bảy tám chín mười mười_một' }, page).codes).toContain('long-note')
  })

  it('chu viet tay mau: muc do + do tin cay thap, khong ap dung cho chu trong hop', () => {
    const hw = { ...good, boxed: false, inkRatio: 0.2, confidence: 0.5 }
    expect(classifyJunk(hw, page).codes).toContain('handwriting')
    expect(classifyJunk({ ...hw, boxed: true }, page).codes).not.toContain('handwriting')
    expect(classifyJunk({ ...hw, confidence: 0.95 }, page).codes).not.toContain('handwriting')
  })

  it('chu qua nho / qua ngan, nguong cau hinh duoc', () => {
    expect(classifyJunk({ ...good, box: { x0: 400, y0: 500, x1: 440, y1: 503 } }, page).codes).toContain('too-small')
    expect(classifyJunk({ ...good, text: 'a' }, page).codes).toContain('too-short')
    // Doi nguong: coi 3px la du lon.
    expect(classifyJunk({ ...good, box: { x0: 400, y0: 500, x1: 440, y1: 503 } }, page,
      { minTextHeightPx: 1, minTextHeightRatio: 0 }).codes).not.toContain('too-small')
    // Nguong tu toi da.
    expect(classifyJunk({ ...good, text: 'một hai ba bốn năm' }, page, { maxWords: 3 }).codes).toContain('long-note')
  })
})

describe('chu lap qua nhieu trang', () => {
  const sample = (pageNumber: number, text: string, y = 20) => ({
    pageNumber, text, box: { x0: 40, y0: y, x1: 200, y1: y + 20 }, pageWidth: 1000, pageHeight: 1400
  })

  it('danh dau header lap o cung vi tri tren >= 3 trang', () => {
    const samples = [
      sample(1, 'Bộ môn Giải phẫu'), sample(2, 'BO MON GIAI PHAU'), sample(3, 'Bộ môn giải phẫu'),
      sample(3, 'Niệu quản', 600), sample(4, 'Bộ môn Giải phẫu', 700)
    ]
    const flagged = markRepeatedAcrossPages(samples)
    expect([...flagged].sort()).toEqual([0, 1, 2])
  })

  it('RepeatTracker: tang dan theo trang, quet lai cung trang khong tinh trung', () => {
    const t = new RepeatTracker({ minPages: 3, positionTolerance: 0.03 })
    expect(t.add(sample(1, 'Logo'))).toBe(false)
    expect(t.add(sample(1, 'Logo'))).toBe(false)
    expect(t.add(sample(2, 'Logo'))).toBe(false)
    expect(t.add(sample(3, 'Logo'))).toBe(true)
  })

  it('nguong so trang cau hinh duoc', () => {
    const flagged = markRepeatedAcrossPages([sample(1, 'X1'), sample(2, 'X1')], { minPages: 2 })
    expect(flagged.size).toBe(2)
  })
})

describe('findContentRect', () => {
  it('tim vung anh va bo qua chu ky ben duoi', () => {
    const w = 400; const h = 600
    const data = new Uint8ClampedArray(w * h * 4).fill(255)
    for (let y = 100; y < 450; y++) for (let x = 60; x < 340; x++) {
      const i = (y * w + x) * 4; data[i] = 80; data[i + 1] = 60; data[i + 2] = 50
    }
    for (let x = 60; x < 140; x++) for (let y = 520; y < 530; y++) { const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0 }
    const r = findContentRect({ data, width: w, height: h })!
    expect(r.y1).toBeLessThan(500)
    expect(r.y0).toBeLessThanOrEqual(100)
    expect(r.x0).toBeLessThanOrEqual(60)
  })
})
