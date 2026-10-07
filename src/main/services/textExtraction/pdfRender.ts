import { readFile, stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { createAsyncLruCache } from './asyncLruCache'

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

// Tai lieu PDF da mo + anh trang da dung duoc giu lai (xem theo yeu cau, lam bai, quet): truoc day moi lan
// hien 1 trang deu doc lai ca file va mo lai tai lieu (file 16 MB mat ~0,5 s/trang, chan ca tien trinh chinh).
// Khoa gom ca mtime + kich thuoc nen file bi thay noi dung thi tu mo lai.
// Luu y: Buffer tra ve duoc dung chung giua cac lan goi - nguoi goi KHONG duoc sua tai cho.
const MAX_OPEN_DOCS = 2
const MAX_CACHED_PAGES = 24
const DOC_CLOSE_DELAY_MS = 30_000

interface OpenPdf {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  task: any
}

const openDocs = createAsyncLruCache<OpenPdf>(MAX_OPEN_DOCS, {
  // Dong tre de khong cat ngang lan dung trang dang chay tren tai lieu vua bi day khoi bo dem.
  onEvict: (open) => {
    setTimeout(() => void open.task.destroy().catch(() => undefined), DOC_CLOSE_DELAY_MS).unref()
  }
})
const pageImages = createAsyncLruCache<Buffer>(MAX_CACHED_PAGES)

async function fileSignature(filePath: string): Promise<string> {
  const info = await stat(filePath)
  return `${filePath}|${info.mtimeMs}|${info.size}`
}

function openPdf(filePath: string, signature: string): Promise<OpenPdf> {
  return openDocs.get(signature, async () => {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const data = new Uint8Array(await readFile(filePath))
    const pdfjsPkgPath = require.resolve('pdfjs-dist/package.json')
    const standardFontDataUrl = pathToFileURL(join(dirname(pdfjsPkgPath), 'standard_fonts') + '/').href
    const task = pdfjsLib.getDocument({ data, standardFontDataUrl })
    return { doc: await task.promise, task }
  })
}

export async function renderPdfPageAsPng(
  filePath: string,
  pageNumber: number,
  scale: number
): Promise<Buffer> {
  const signature = await fileSignature(filePath)
  return pageImages.get(`${signature}|${pageNumber}|${scale}`, async () => {
    const { doc } = await openPdf(filePath, signature)
    const page = await doc.getPage(pageNumber)
    try {
      return await renderPageToPngBuffer(page, scale)
    } finally {
      page.cleanup()
    }
  })
}

// Chi doc so trang, khong render - dung de renderer biet truoc tong so trang
// truoc khi cuon lazy-load tung anh trang qua renderPdfPageAsPng.
export async function getPdfPageCount(filePath: string): Promise<number> {
  const { doc } = await openPdf(filePath, await fileSignature(filePath))
  return doc.numPages
}
