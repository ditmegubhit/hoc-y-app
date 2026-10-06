import { createCanvas, type Canvas, type Image } from '@napi-rs/canvas'
import type { Rect } from '../../../shared/types/anatomyQuiz'

// Tien xu ly anh 1 dong chu truoc khi nhan dang. Phan thuan (Otsu, dao mau, do cao
// cho Tesseract) tach rieng de test; phan canvas chi cat/phong/ve nen.

/** Nguong Otsu tren anh xam 0..255. */
export function otsuThreshold(gray: ArrayLike<number>): number {
  const hist = new Array<number>(256).fill(0)
  for (let i = 0; i < gray.length; i++) hist[Math.max(0, Math.min(255, Math.round(gray[i])))]++
  const total = gray.length
  let sumAll = 0
  for (let i = 0; i < 256; i++) sumAll += i * hist[i]
  let sumBack = 0; let weightBack = 0; let best = 0; let bestVar = -1
  for (let t = 0; t < 256; t++) {
    weightBack += hist[t]
    if (weightBack === 0) continue
    const weightFore = total - weightBack
    if (weightFore === 0) break
    sumBack += t * hist[t]
    const meanBack = sumBack / weightBack
    const meanFore = (sumAll - sumBack) / weightFore
    const between = weightBack * weightFore * (meanBack - meanFore) ** 2
    if (between > bestVar) { bestVar = between; best = t }
  }
  return best
}

/** Chu SANG tren nen TOI (can dao mau): lop it diem hon (chu) sang hon lop nhieu diem (nen). */
export function isLightOnDark(gray: ArrayLike<number>, threshold: number): boolean {
  let dark = 0; let darkSum = 0; let light = 0; let lightSum = 0
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] <= threshold) { dark++; darkSum += gray[i] } else { light++; lightSum += gray[i] }
  }
  if (dark === 0 || light === 0) return false
  const minority = light < dark ? 'light' : 'dark'
  return minority === 'light'
}

/** Do tuong phan cua anh xam (do lech chuan / 128): thap = anh nhat nhoa/khong co chu. */
export function contrastOf(gray: ArrayLike<number>): number {
  if (gray.length === 0) return 0
  let sum = 0
  for (let i = 0; i < gray.length; i++) sum += gray[i]
  const mean = sum / gray.length
  let variance = 0
  for (let i = 0; i < gray.length; i++) variance += (gray[i] - mean) ** 2
  return Math.sqrt(variance / gray.length) / 128
}

export function luminanceOf(data: ArrayLike<number>): Uint8Array {
  const gray = new Uint8Array(data.length / 4)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
  return gray
}

export type PrepMode = 'plain' | 'normalize' | 'binary' | 'auto'

export interface PrepOptions {
  /** Phan tram do cao dong them vao moi canh (mac dinh 0.12). */
  padRatio?: number
  /** Chieu cao dich (px) sau khi phong/thu: anh co chieu cao nho hon se duoc phong len. 0 = giu nguyen. */
  targetHeight?: number
  /** Gioi han he so phong. */
  maxScale?: number
  /** plain = chi cat/phong; auto = chi dao mau (sang xam) khi chu sang tren nen toi; normalize = dao mau neu chu sang tren nen toi + chuyen xam; binary = them Otsu. */
  mode?: PrepMode
  /** Vien trang (px, sau phong) them quanh anh. */
  border?: number
}

export interface PreparedLine {
  canvas: Canvas
  width: number
  height: number
  inverted: boolean
  contrast: number
}

/** Cat 1 hop khoi anh trang, phong len `targetHeight`, tuy chon chuan hoa mau. */
export function prepareLine(image: Image | Canvas, box: Rect, options: PrepOptions = {}): PreparedLine | null {
  const w0 = image.width; const h0 = image.height
  const boxH = Math.max(1, box.y1 - box.y0)
  const pad = Math.max(2, boxH * (options.padRatio ?? 0.12))
  const x0 = Math.max(0, Math.floor(box.x0 - pad)); const y0 = Math.max(0, Math.floor(box.y0 - pad))
  const x1 = Math.min(w0, Math.ceil(box.x1 + pad)); const y1 = Math.min(h0, Math.ceil(box.y1 + pad))
  const cw = x1 - x0; const ch = y1 - y0
  if (cw < 2 || ch < 2) return null
  const target = options.targetHeight ?? 0
  const scale = target > 0 ? Math.max(0.25, Math.min(options.maxScale ?? 4, target / ch)) : 1
  const border = options.border ?? 0
  const width = Math.max(2, Math.round(cw * scale)); const height = Math.max(2, Math.round(ch * scale))
  const canvas = createCanvas(width + border * 2, height + border * 2)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image as Image, x0, y0, cw, ch, border, border, width, height)
  const mode = options.mode ?? 'plain'
  const data = ctx.getImageData(border, border, width, height)
  const gray = luminanceOf(data.data)
  const contrast = contrastOf(gray)
  let inverted = false
  const threshold = mode === 'plain' ? 0 : otsuThreshold(gray)
  if (mode !== 'plain') inverted = isLightOnDark(gray, threshold)
  if (mode === 'normalize' || mode === 'binary' || (mode === 'auto' && inverted)) {
    const px = data.data
    for (let i = 0; i < px.length; i += 4) {
      let v = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])
      if (inverted) v = 255 - v
      if (mode === 'binary') v = v > (inverted ? 255 - threshold : threshold) ? 255 : 0
      px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255
    }
    ctx.putImageData(data, border, border)
  }
  return { canvas, width: canvas.width, height: canvas.height, inverted, contrast }
}
