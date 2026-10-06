import { describe, expect, it } from 'vitest'
import type { PracticeRegion } from '../types/practice'
import {
  DEFAULT_SPLIT_RATIO,
  MAX_SPLIT_RATIO,
  MIN_BOX_SIZE,
  MIN_SPLIT_RATIO,
  applyPatchToRegion,
  buildInversePatch,
  buildReviewQueue,
  clampPage,
  clampRectToImage,
  clampSplitRatio,
  cycleHit,
  firstAliveIndex,
  formatAlternates,
  handlePosition,
  hexToHsv,
  hitCandidates,
  hsToWheelPoint,
  hsvToHex,
  initialAnswerOf,
  isAnswerFormDirty,
  isConfirmableAnswer,
  moveRect,
  parseAlternates,
  parseRecentColors,
  parseSplitRatio,
  patchChangesRegion,
  pickHit,
  popUndo,
  pushRecentColor,
  pushUndo,
  rectFromPoints,
  regionVisualState,
  resizeRectByHandle,
  scaleRect,
  splitRatioFromPointer,
  stepQueueIndex,
  suspectReasonText,
  wheelPointToHs,
  type EditAction
} from './editLogic'

function makeRegion(over: Partial<PracticeRegion> = {}): PracticeRegion {
  return {
    id: 'r1', fileId: 'f', pageNumber: 1, labelBox: { x0: 100, y0: 100, x1: 200, y1: 140 },
    refWidth: 1000, refHeight: 1000, rawText: 'raw', answerText: null, alternates: [], cropBox: null,
    confidence: null, leaderScore: null, suspect: false, status: 'pending', reviewed: false,
    colorOverride: null, opacityOverride: null, manual: false, createdAt: '', updatedAt: '', ...over
  }
}

describe('hinh hoc vung che', () => {
  it('clampRectToImage sap xep, cat trong anh va giu kich thuoc toi thieu', () => {
    expect(clampRectToImage({ x0: 300, y0: 200, x1: 100, y1: 50 }, 1000, 800)).toEqual({ x0: 100, y0: 50, x1: 300, y1: 200 })
    expect(clampRectToImage({ x0: -50, y0: -5, x1: 1200, y1: 900 }, 1000, 800)).toEqual({ x0: 0, y0: 0, x1: 1000, y1: 800 })
    const tiny = clampRectToImage({ x0: 10, y0: 10, x1: 11, y1: 11 }, 1000, 800)
    expect(tiny.x1 - tiny.x0).toBeGreaterThanOrEqual(MIN_BOX_SIZE)
    expect(tiny.y1 - tiny.y0).toBeGreaterThanOrEqual(MIN_BOX_SIZE)
    // sat mep phai: lui x0 de du kich thuoc
    const edge = clampRectToImage({ x0: 999, y0: 10, x1: 1000, y1: 40 }, 1000, 800)
    expect(edge.x1).toBe(1000)
    expect(edge.x1 - edge.x0).toBe(MIN_BOX_SIZE)
  })

  it('moveRect giu kich thuoc va khong ra ngoai anh', () => {
    const box = { x0: 100, y0: 100, x1: 200, y1: 140 }
    expect(moveRect(box, 30, -20, 1000, 800)).toEqual({ x0: 130, y0: 80, x1: 230, y1: 120 })
    expect(moveRect(box, -500, -500, 1000, 800)).toEqual({ x0: 0, y0: 0, x1: 100, y1: 40 })
    expect(moveRect(box, 5000, 5000, 1000, 800)).toEqual({ x0: 900, y0: 760, x1: 1000, y1: 800 })
  })

  it('resizeRectByHandle doi co theo tay cam, khong vuot canh doi dien', () => {
    const box = { x0: 100, y0: 100, x1: 200, y1: 140 }
    expect(resizeRectByHandle(box, 'se', 20, 10, 1000, 800)).toEqual({ x0: 100, y0: 100, x1: 220, y1: 150 })
    expect(resizeRectByHandle(box, 'nw', -30, -10, 1000, 800)).toEqual({ x0: 70, y0: 90, x1: 200, y1: 140 })
    expect(resizeRectByHandle(box, 'e', 15, 999, 1000, 800)).toEqual({ x0: 100, y0: 100, x1: 215, y1: 140 })
    expect(resizeRectByHandle(box, 'n', 999, 25, 1000, 800)).toEqual({ x0: 100, y0: 125, x1: 200, y1: 140 })
    // keo canh trai qua canh phai -> dung o kich thuoc toi thieu
    const squeezed = resizeRectByHandle(box, 'w', 500, 0, 1000, 800)
    expect(squeezed.x1 - squeezed.x0).toBe(MIN_BOX_SIZE)
    expect(squeezed.x1).toBe(200)
    // khong ra ngoai anh
    expect(resizeRectByHandle(box, 'sw', -500, 5000, 1000, 800)).toEqual({ x0: 0, y0: 100, x1: 200, y1: 800 })
  })

  it('handlePosition va rectFromPoints, scaleRect', () => {
    const box = { x0: 0, y0: 0, x1: 100, y1: 50 }
    expect(handlePosition(box, 'nw')).toEqual({ x: 0, y: 0 })
    expect(handlePosition(box, 'e')).toEqual({ x: 100, y: 25 })
    expect(handlePosition(box, 's')).toEqual({ x: 50, y: 50 })
    expect(rectFromPoints({ x: 50, y: 5 }, { x: 10, y: 40 })).toEqual({ x0: 10, y0: 5, x1: 50, y1: 40 })
    expect(scaleRect({ x0: 10, y0: 20, x1: 30, y1: 40 }, 100, 100, 200, 400)).toEqual({ x0: 20, y0: 80, x1: 60, y1: 160 })
    expect(scaleRect({ x0: 10, y0: 20, x1: 30, y1: 40 }, 0, 0, 200, 400)).toEqual({ x0: 10, y0: 20, x1: 30, y1: 40 })
  })
})

describe('chon vung (hit-test)', () => {
  const items = [
    { id: 'big', box: { x0: 0, y0: 0, x1: 300, y1: 300 } },
    { id: 'small', box: { x0: 100, y0: 100, x1: 150, y1: 130 } },
    { id: 'mid', box: { x0: 50, y0: 50, x1: 200, y1: 200 } },
    { id: 'far', box: { x0: 500, y0: 500, x1: 600, y1: 600 } }
  ]

  it('uu tien vung nho truoc', () => {
    expect(hitCandidates(items, 120, 110)).toEqual(['small', 'mid', 'big'])
    expect(hitCandidates(items, 10, 10)).toEqual(['big'])
    expect(hitCandidates(items, 450, 450)).toEqual([])
  })

  it('co do sai so cho vung rat nho', () => {
    expect(hitCandidates(items, 505 - 10, 495, 8)).toEqual(['far'])
    expect(hitCandidates(items, 505 - 10, 495, 0)).toEqual([])
  })

  it('pickHit giu vung dang chon neu van nam trong diem bam', () => {
    const c = hitCandidates(items, 120, 110)
    expect(pickHit(c, null)).toBe('small')
    expect(pickHit(c, 'big')).toBe('big')
    expect(pickHit(c, 'far')).toBe('small')
    expect(pickHit([], 'big')).toBeNull()
  })

  it('cycleHit xoay vong qua cac vung chong len nhau', () => {
    const c = hitCandidates(items, 120, 110)
    expect(cycleHit(c, 'small')).toBe('mid')
    expect(cycleHit(c, 'mid')).toBe('big')
    expect(cycleHit(c, 'big')).toBe('small')
    expect(cycleHit(c, null)).toBe('small')
    expect(cycleHit(['only'], 'only')).toBe('only')
    expect(cycleHit([], 'x')).toBeNull()
  })

  it('cung dien tich thi vung ve sau (tren cung) truoc', () => {
    const same = [
      { id: 'a', box: { x0: 0, y0: 0, x1: 10, y1: 10 } },
      { id: 'b', box: { x0: 0, y0: 0, x1: 10, y1: 10 } }
    ]
    expect(hitCandidates(same, 5, 5)).toEqual(['b', 'a'])
  })
})

describe('hoan tac', () => {
  it('buildInversePatch chi chua truong bi doi, voi gia tri cu', () => {
    const region = makeRegion({ answerText: 'cu', alternates: ['x'], colorOverride: '#ff0000' })
    const inverse = buildInversePatch(region, { answerText: 'moi', status: 'confirmed', cropBox: null })
    expect(inverse).toEqual({ answerText: 'cu', status: 'pending', cropBox: null })
  })

  it('ap patch roi ap inverse thi ve lai nhu cu', () => {
    const region = makeRegion({ answerText: 'cu', alternates: ['x'] })
    const patch = { answerText: '  moi ', alternates: ['a', ' ', 'b'], status: 'confirmed' as const, reviewed: true }
    const after = applyPatchToRegion(region, patch)
    expect(after.answerText).toBe('moi')
    expect(after.alternates).toEqual(['a', 'b'])
    expect(after.status).toBe('confirmed')
    const back = applyPatchToRegion(after, buildInversePatch(region, patch))
    expect(back.answerText).toBe('cu')
    expect(back.alternates).toEqual(['x'])
    expect(back.status).toBe('pending')
    expect(back.reviewed).toBe(false)
  })

  it('patchChangesRegion phat hien thao tac rong', () => {
    const region = makeRegion({ answerText: 'abc', alternates: ['x'] })
    expect(patchChangesRegion(region, { answerText: ' abc ' })).toBe(false)
    expect(patchChangesRegion(region, { alternates: ['x'] })).toBe(false)
    expect(patchChangesRegion(region, { labelBox: { ...region.labelBox } })).toBe(false)
    expect(patchChangesRegion(region, { answerText: 'abd' })).toBe(true)
    expect(patchChangesRegion(region, { colorOverride: '#000000' })).toBe(true)
    expect(patchChangesRegion(region, { cropBox: null })).toBe(false)
  })

  it('ngan xep push/pop theo thu tu LIFO va gioi han', () => {
    const a: EditAction = { kind: 'create', regionId: 'a', label: 'a' }
    const b: EditAction = { kind: 'delete', region: makeRegion(), label: 'b' }
    let stack: EditAction[] = []
    stack = pushUndo(stack, a)
    stack = pushUndo(stack, b)
    const first = popUndo(stack)
    expect(first.action).toBe(b)
    const second = popUndo(first.stack)
    expect(second.action).toBe(a)
    expect(popUndo(second.stack).action).toBeNull()
    expect(stack).toHaveLength(2) // khong sua mang goc
    const limited = [1, 2, 3, 4, 5].reduce<number[]>((s, n) => pushUndo(s, n, 3), [])
    expect(limited).toEqual([3, 4, 5])
  })
})

describe('mau HSV <-> hex', () => {
  it('hsvToHex cac mau co ban', () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000')
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00ff00')
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe('#0000ff')
    expect(hsvToHex({ h: 0, s: 0, v: 1 })).toBe('#ffffff')
    expect(hsvToHex({ h: 123, s: 0.4, v: 0 })).toBe('#000000')
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#ff0000')
  })

  it('hexToHsv va khu hoi', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 })
    expect(hexToHsv('#0a0a0a')?.v).toBeCloseTo(10 / 255, 5)
    expect(hexToHsv('#fff')).toEqual({ h: 0, s: 0, v: 1 })
    expect(hexToHsv('zzz')).toBeNull()
    for (const hex of ['#12ab34', '#ffd60a', '#6a1b9a', '#0a0a0a', '#808080', '#ff00aa']) {
      const hsv = hexToHsv(hex)
      expect(hsv).not.toBeNull()
      expect(hsvToHex(hsv!)).toBe(hex)
    }
  })

  it('diem tren vong tron <-> sac do/bao hoa', () => {
    expect(wheelPointToHs(50, 0, 50)).toEqual({ h: 0, s: 1 })
    const down = wheelPointToHs(0, 25, 50) // y huong xuong = 90 do
    expect(down.h).toBeCloseTo(90, 5)
    expect(down.s).toBeCloseTo(0.5, 5)
    expect(wheelPointToHs(500, 0, 50).s).toBe(1) // ngoai vong -> bao hoa toi da
    expect(wheelPointToHs(0, 0, 50).s).toBe(0)
    const p = hsToWheelPoint(90, 0.5, 50)
    expect(p.dx).toBeCloseTo(0, 5)
    expect(p.dy).toBeCloseTo(25, 5)
  })

  it('mau gan day: moi nhat dau, khong trung, toi da 8, bo mau sai', () => {
    let list: string[] = []
    list = pushRecentColor(list, '#FF0000')
    list = pushRecentColor(list, '#00ff00')
    list = pushRecentColor(list, '#ff0000')
    expect(list).toEqual(['#ff0000', '#00ff00'])
    expect(pushRecentColor(list, 'khong-phai-mau')).toEqual(list)
    const many = Array.from({ length: 12 }, (_, i) => `#0000${i.toString(16).padStart(2, '0')}`).reduce(
      (acc, c) => pushRecentColor(acc, c),
      [] as string[]
    )
    expect(many).toHaveLength(8)
    expect(parseRecentColors('["#ABCDEF","bad","#abcdef",3]')).toEqual(['#abcdef'])
    expect(parseRecentColors('khong phai json')).toEqual([])
    expect(parseRecentColors(null)).toEqual([])
  })
})

describe('dap an khac', () => {
  it('tach theo ; cat khoang trang, bo rong va trung', () => {
    expect(parseAlternates('a; b ;; A ;  b  ; c d')).toEqual(['a', 'b', 'c d'])
    expect(parseAlternates('')).toEqual([])
    expect(parseAlternates(' ; ; ')).toEqual([])
    expect(parseAlternates('x；y')).toEqual(['x', 'y'])
  })

  it('bo cai trung dap an chinh', () => {
    expect(parseAlternates('Niệu quản; niệu đạo', 'niệu quản')).toEqual(['niệu đạo'])
  })

  it('formatAlternates', () => {
    expect(formatAlternates(['a', 'b'])).toBe('a; b')
    expect(formatAlternates([])).toBe('')
  })

  it('isConfirmableAnswer, initialAnswerOf, isAnswerFormDirty', () => {
    expect(isConfirmableAnswer('  ')).toBe(false)
    expect(isConfirmableAnswer(' a ')).toBe(true)
    expect(initialAnswerOf(makeRegion({ answerText: null, rawText: 'raw' }))).toBe('raw')
    expect(initialAnswerOf(makeRegion({ answerText: 'da luu', rawText: 'raw' }))).toBe('da luu')
    const region = makeRegion({ answerText: 'abc', alternates: ['x', 'y'] })
    expect(isAnswerFormDirty(region, 'abc', 'x; y')).toBe(false)
    expect(isAnswerFormDirty(region, ' abc ', 'y;x')).toBe(true)
    expect(isAnswerFormDirty(region, 'abd', 'x; y')).toBe(true)
    expect(isAnswerFormDirty(region, 'abc', 'x')).toBe(true)
    expect(isAnswerFormDirty(region, 'abc', 'x; y; ABC')).toBe(false)
  })
})

describe('hang doi duyet trinh tu', () => {
  const regions = [
    makeRegion({ id: 'p2', pageNumber: 2 }),
    makeRegion({ id: 'b', labelBox: { x0: 500, y0: 300, x1: 600, y1: 340 } }),
    makeRegion({ id: 'a', labelBox: { x0: 10, y0: 100, x1: 110, y1: 140 } }),
    makeRegion({ id: 'done', reviewed: true, labelBox: { x0: 0, y0: 0, x1: 50, y1: 20 } })
  ]

  it('buildReviewQueue ket hop reviewOrder', () => {
    expect(buildReviewQueue(regions, { startPage: 1, onlyUnreviewed: true })).toEqual(['a', 'b', 'p2'])
    expect(buildReviewQueue(regions, { startPage: 1, onlyUnreviewed: false })).toEqual(['done', 'a', 'b', 'p2'])
    expect(buildReviewQueue(regions, { startPage: 2, onlyUnreviewed: false })).toEqual(['p2'])
  })

  it('stepQueueIndex di tien/lui va bo qua vung da xoa', () => {
    const queue = ['a', 'b', 'c', 'd']
    const alive = (id: string): boolean => id !== 'b' && id !== 'c'
    expect(stepQueueIndex(queue, 0, 1, alive)).toBe(3)
    expect(stepQueueIndex(queue, 3, -1, alive)).toBe(0)
    expect(stepQueueIndex(queue, 0, -1, alive)).toBe(-1)
    expect(stepQueueIndex(queue, 3, 1, alive)).toBe(4) // het hang doi
    expect(stepQueueIndex(queue, 0, 1, () => true)).toBe(1)
    expect(stepQueueIndex([], 0, 1, () => true)).toBe(0)
  })

  it('firstAliveIndex', () => {
    const queue = ['a', 'b', 'c']
    expect(firstAliveIndex(queue, 0, (id) => id === 'c')).toBe(2)
    expect(firstAliveIndex(queue, 0, () => false)).toBe(3)
    expect(firstAliveIndex(queue, 1, () => true)).toBe(1)
  })
})

describe('ti le chia 1/4 - 3/4', () => {
  it('gioi han min/max va mac dinh', () => {
    expect(DEFAULT_SPLIT_RATIO).toBe(0.25)
    expect(clampSplitRatio(0.01)).toBe(MIN_SPLIT_RATIO)
    expect(clampSplitRatio(0.99)).toBe(MAX_SPLIT_RATIO)
    expect(clampSplitRatio(0.3)).toBe(0.3)
    expect(clampSplitRatio(Number.NaN)).toBe(DEFAULT_SPLIT_RATIO)
  })

  it('tinh ti le tu vi tri con tro', () => {
    expect(splitRatioFromPointer(300, 100, 800)).toBe(0.25)
    expect(splitRatioFromPointer(0, 100, 800)).toBe(MIN_SPLIT_RATIO)
    expect(splitRatioFromPointer(5000, 100, 800)).toBe(MAX_SPLIT_RATIO)
    expect(splitRatioFromPointer(300, 100, 0)).toBe(DEFAULT_SPLIT_RATIO)
  })

  it('parseSplitRatio doc tu localStorage', () => {
    expect(parseSplitRatio(null)).toBe(DEFAULT_SPLIT_RATIO)
    expect(parseSplitRatio('')).toBe(DEFAULT_SPLIT_RATIO)
    expect(parseSplitRatio('abc')).toBe(DEFAULT_SPLIT_RATIO)
    expect(parseSplitRatio('0.4')).toBe(0.4)
    expect(parseSplitRatio('5')).toBe(MAX_SPLIT_RATIO)
  })
})

describe('trang thai hien thi', () => {
  it('regionVisualState theo status', () => {
    expect(regionVisualState({ status: 'pending' })).toBe('unreviewed')
    expect(regionVisualState({ status: 'confirmed' })).toBe('confirmed')
    expect(regionVisualState({ status: 'rejected' })).toBe('maskOnly')
  })

  it('suspectReasonText uu tien truong suspectReasons neu co, neu khong thi suy ra', () => {
    const withReasons = { ...makeRegion({ suspect: true }), suspectReasons: ['gan mep trang', 'lap lai'] } as PracticeRegion
    expect(suspectReasonText(withReasons)).toBe('gan mep trang, lap lai')
    expect(suspectReasonText(makeRegion({ suspect: true, leaderScore: 0.1, rawText: 'a' }))).toBe(
      'không thấy đường dẫn, chữ quá ngắn'
    )
    expect(suspectReasonText(makeRegion({ suspect: true, rawText: 'niệu quản' }))).toBe('nghi là rác')
  })

  it('clampPage', () => {
    expect(clampPage(0, 10)).toBe(1)
    expect(clampPage(11, 10)).toBe(10)
    expect(clampPage(5, null)).toBe(5)
    expect(clampPage(Number.NaN, 10)).toBe(1)
  })
})
