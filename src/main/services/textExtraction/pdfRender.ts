import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'

// Dung chung cho ca OCR fallback luc extract lan viewer luc xem, de anh hien
// thi nhat quan chat luong voi anh da dung OCR.
export const RENDER_SCALE = 2.2

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function renderPageToPngBuffer(page: any, scale: number): Promise<Buffer> {
  const viewport = page.getViewport({ scale })
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const ctx = canvas.getContext('2d')

  const renderTask = page.render({ canvasContext: ctx, viewport })
  await renderTask.promise

  return canvas.toBuffer('image/png')
}

// Dung cho viewer (xem theo yeu cau, khac thoi diem voi luc extract) - tu mo
// file PDF, lay dung trang, render, roi dong lai - khong giu doc mo lau dai.
export async function renderPdfPageAsPng(
  filePath: string,
  pageNumber: number,
  scale: number
): Promise<Buffer> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(await readFile(filePath))

  const pdfjsPkgPath = require.resolve('pdfjs-dist/package.json')
  const standardFontDataUrl = pathToFileURL(
    join(dirname(pdfjsPkgPath), 'standard_fonts') + '/'
  ).href

  const loadingTask = pdfjsLib.getDocument({ data, standardFontDataUrl })
  const doc = await loadingTask.promise
  try {
    const page = await doc.getPage(pageNumber)
    try {
      return await renderPageToPngBuffer(page, scale)
    } finally {
      page.cleanup()
    }
  } finally {
    await loadingTask.destroy()
  }
}

// Chi doc so trang, khong render - dung de renderer biet truoc tong so trang
// truoc khi cuon lazy-load tung anh trang qua renderPdfPageAsPng.
export async function getPdfPageCount(filePath: string): Promise<number> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(await readFile(filePath))

  const loadingTask = pdfjsLib.getDocument({ data })
  const doc = await loadingTask.promise
  try {
    return doc.numPages
  } finally {
    await loadingTask.destroy()
  }
}
