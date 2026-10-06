import { describe, it, expect } from 'vitest'
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas'
import { findLabelPanel, scoreLeaderLine, sharedLeader, type RgbaImage } from './leaderLine'
import { regroupLabelFragments } from './labelGrouping'

// Anh tong hop: nen nhieu (giong anh chup) + hop chu + duong dan ve bang canvas.

function noisyImage(width: number, height: number, draw: (ctx: SKRSContext2D) => void): RgbaImage {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  // Nen nau-xam nhieu, giu co dinh bang bo sinh gia ngau nhien de test on dinh.
  let seed = 12345
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
  const base = ctx.createImageData(width, height)
  for (let i = 0; i < width * height; i++) {
    const n = (rnd() - 0.5) * 36
    base.data[i * 4] = 120 + n; base.data[i * 4 + 1] = 85 + n; base.data[i * 4 + 2] = 70 + n; base.data[i * 4 + 3] = 255
  }
  ctx.putImageData(base, 0, 0)
  draw(ctx)
  const out = ctx.getImageData(0, 0, width, height)
  return { data: out.data, width, height }
}

/** Hop trang vien den; tra ve o chu (ben trong, co le). */
function drawLabelBox(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, fill = '#ffffff') {
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = '#000000'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h)
  ctx.fillStyle = '#111111'
  // "Chu" = cac thanh den ngan.
  for (let i = 0; i < 6; i++) ctx.fillRect(x + 12 + i * 14, y + 12, 9, h - 24)
  return { x0: x + 10, y0: y + 10, x1: x + w - 10, y1: y + h - 10 }
}

function line(ctx: SKRSContext2D, color: string, pts: Array<[number, number]>, width = 3) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1])
  ctx.stroke()
}

describe('scoreLeaderLine', () => {
  it('nhan hop trang co duong dan vang thang: co duong dan, dau cuoi gan dau net', () => {
    let box = { x0: 0, y0: 0, x1: 0, y1: 0 }
    const img = noisyImage(520, 300, (ctx) => {
      box = drawLabelBox(ctx, 40, 100, 160, 50)
      line(ctx, '#ffff00', [[200, 125], [400, 220]])
    })
    const r = scoreLeaderLine(img, box)
    expect(r.panel.boxed).toBe(true)
    expect(r.hasLeader).toBe(true)
    expect(r.endpoint!.x).toBeGreaterThan(330)
    expect(r.endpoint!.y).toBeGreaterThan(170)
  })

  it('duong dan cong van duoc nhan ra', () => {
    let box = { x0: 0, y0: 0, x1: 0, y1: 0 }
    const img = noisyImage(520, 320, (ctx) => {
      box = drawLabelBox(ctx, 300, 40, 160, 50)
      ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 3; ctx.beginPath()
      ctx.moveTo(300, 65); ctx.quadraticCurveTo(200, 70, 150, 230); ctx.stroke()
    })
    const r = scoreLeaderLine(img, box)
    expect(r.hasLeader).toBe(true)
    expect(r.endpoint!.y).toBeGreaterThan(150)
  })

  it('khong co duong dan: hasLeader false', () => {
    let box = { x0: 0, y0: 0, x1: 0, y1: 0 }
    const img = noisyImage(400, 240, (ctx) => { box = drawLabelBox(ctx, 120, 90, 160, 50) })
    expect(scoreLeaderLine(img, box).hasLeader).toBe(false)
  })

  it('net nam trong hop chu hoac vien hop khong duoc tinh', () => {
    let box = { x0: 0, y0: 0, x1: 0, y1: 0 }
    const img = noisyImage(400, 240, (ctx) => {
      box = drawLabelBox(ctx, 120, 90, 220, 60)
      line(ctx, '#ff0000', [[130, 120], [300, 120]]) // net do ngay ben trong hop
    })
    expect(scoreLeaderLine(img, box).hasLeader).toBe(false)
  })

  it('doan net qua ngan khong du la duong dan', () => {
    let box = { x0: 0, y0: 0, x1: 0, y1: 0 }
    const img = noisyImage(400, 240, (ctx) => {
      box = drawLabelBox(ctx, 120, 90, 160, 50)
      line(ctx, '#ffff00', [[280, 115], [292, 118]])
    })
    expect(scoreLeaderLine(img, box).hasLeader).toBe(false)
  })

  it('hop mau (cam) voi net cung mau cung duoc nhan ra', () => {
    let box = { x0: 0, y0: 0, x1: 0, y1: 0 }
    const img = noisyImage(520, 300, (ctx) => {
      box = drawLabelBox(ctx, 40, 100, 160, 50, '#f06458')
      line(ctx, '#f06458', [[200, 125], [400, 230]], 2)
    })
    expect(scoreLeaderLine(img, box).hasLeader).toBe(true)
  })
})

describe('findLabelPanel', () => {
  it('nhan ra hop trang rong hon o chu', () => {
    let box = { x0: 0, y0: 0, x1: 0, y1: 0 }
    const img = noisyImage(400, 240, (ctx) => { box = drawLabelBox(ctx, 100, 80, 200, 70) })
    const p = findLabelPanel(img, box)
    expect(p.boxed).toBe(true)
    expect(p.rect.x0).toBeLessThanOrEqual(101)
    expect(p.rect.x1).toBeGreaterThanOrEqual(299)
  })

  it('chu tren anh khong co hop: boxed false', () => {
    const img = noisyImage(400, 240, () => undefined)
    expect(findLabelPanel(img, { x0: 100, y0: 100, x1: 200, y1: 125 }).boxed).toBe(false)
  })
})

describe('sharedLeader / regroupLabelFragments', () => {
  it('ba nhan xep sat, moi nhan 1 mui ten rieng: khong gop', () => {
    const boxes = [
      { x0: 260, y0: 60, x1: 380, y1: 84 },
      { x0: 260, y0: 92, x1: 380, y1: 116 },
      { x0: 260, y0: 124, x1: 380, y1: 148 }
    ]
    const img = noisyImage(520, 320, (ctx) => {
      ctx.fillStyle = '#f06458'
      for (const b of boxes) {
        ctx.fillRect(b.x0 - 6, b.y0 - 3, b.x1 - b.x0 + 12, b.y1 - b.y0 + 6)
        ctx.fillStyle = '#111111'; ctx.fillRect(b.x0 + 4, b.y0 + 6, 80, 12); ctx.fillStyle = '#f06458'
      }
      line(ctx, '#f06458', [[254, 72], [120, 160]], 2)
      line(ctx, '#f06458', [[254, 104], [120, 220]], 2)
      line(ctx, '#f06458', [[254, 136], [120, 280]], 2)
    })
    const s = sharedLeader(img, boxes[0], boxes[1])
    expect(s.shared).toBe(false)
    const labels = regroupLabelFragments(img, boxes.map((b, i) => ({ box: b, text: `NHAN ${i}`, confidence: 0.9 })))
    expect(labels).toHaveLength(3)
  })

  it('nhan 2 dong chung 1 hop va 1 duong dan: gop thanh 1', () => {
    const a = { x0: 50, y0: 100, x1: 180, y1: 124 }
    const b = { x0: 50, y0: 130, x1: 120, y1: 154 }
    const img = noisyImage(520, 300, (ctx) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(36, 90, 170, 76)
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(36, 90, 170, 76)
      ctx.fillStyle = '#111'; ctx.fillRect(a.x0 + 4, a.y0 + 6, 100, 12); ctx.fillRect(b.x0 + 4, b.y0 + 6, 50, 12)
      line(ctx, '#ffff00', [[206, 128], [400, 200]])
    })
    const labels = regroupLabelFragments(img, [
      { box: a, text: 'CUNG KHAU CAI', confidence: 0.9 }, { box: b, text: 'HAU', confidence: 0.9 }
    ])
    expect(labels).toHaveLength(1)
    expect(labels[0].text).toBe('CUNG KHAU CAI HAU')
  })
})
