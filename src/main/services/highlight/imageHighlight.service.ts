import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { highlightTempDir } from '../fileStorage.service'
import type { Rect } from './wordMatch'

// Tao 1 ban sao TAM cua anh (khong dung file goc), ve khung vang ban trong
// suot len dung vi tri tu khoa - toa do pixel dung thang, khong can quy doi
// vi OCR chay tren dung buffer nay.
export async function createHighlightedImageCopy(
  sourcePath: string,
  rects: Rect[]
): Promise<string> {
  const buffer = await readFile(sourcePath)
  const img = await loadImage(buffer)

  const canvas = createCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)

  ctx.fillStyle = 'rgba(255, 255, 0, 0.35)'
  for (const rect of rects) {
    ctx.fillRect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0)
  }

  const outBuffer = canvas.toBuffer('image/png')

  const dir = highlightTempDir()
  await mkdir(dir, { recursive: true })
  const outPath = join(dir, `${randomUUID()}.png`)
  await writeFile(outPath, outBuffer)

  return outPath
}
