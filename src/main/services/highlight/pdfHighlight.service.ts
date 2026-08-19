import { PDFDocument, rgb } from 'pdf-lib'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { highlightTempDir } from '../fileStorage.service'
import type { Rect } from './wordMatch'

// Tao 1 ban sao TAM cua file PDF (khong dung file goc), ve khung vang ban
// trong suot len dung trang chua tu khoa - vi la hinh chu nhat ve thang vao
// content stream (khong phai PDF annotation chuan /Subtype /Highlight, pdf-lib
// khong ho tro san, tu dung annotation dictionary phuc tap hon nhieu va rui
// ro hien thi khong nhat quan giua cac app doc PDF), nen hien thi giong het
// nhau o MOI trinh doc PDF.
export async function createHighlightedPdfCopy(
  sourcePath: string,
  pageIndex1Based: number,
  rects: Rect[],
  coordSpace: 'pdf_point' | 'image_pixel',
  refWidth: number,
  refHeight: number
): Promise<string> {
  const bytes = await readFile(sourcePath)
  const pdfDoc = await PDFDocument.load(bytes)

  const page = pdfDoc.getPage(pageIndex1Based - 1)
  const { width: pageW, height: pageH } = page.getSize()

  // OCR/anh dung toa do pixel (y-down) cua PNG da render - can quy doi ve
  // point (y-up) cua trang PDF that. Chu nghia thuc su cua file: scale la ty
  // le giua kich thuoc PNG luc render voi kich thuoc trang PDF that.
  const scale = coordSpace === 'image_pixel' ? refWidth / pageW : 1

  for (const rect of rects) {
    const x = rect.x0 / scale
    const w = (rect.x1 - rect.x0) / scale
    const h = (rect.y1 - rect.y0) / scale
    const y = coordSpace === 'image_pixel' ? pageH - rect.y1 / scale : rect.y0

    page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 0), opacity: 0.35 })
  }

  const outBytes = await pdfDoc.save()

  const dir = highlightTempDir()
  await mkdir(dir, { recursive: true })
  const outPath = join(dir, `${randomUUID()}.pdf`)
  await writeFile(outPath, outBytes)

  return outPath
}
