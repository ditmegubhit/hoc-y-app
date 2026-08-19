import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { recognizeImageWithWords } from '../ocr/ocrEngine'
import { ocrLimiter } from '../ocr/limiter'
import { renderPageToPngBuffer, RENDER_SCALE } from './pdfRender'
import type { ExtractedChunk, ExtractedWord } from './index'

// Nguong "trang rong": du bo qua so trang/watermark ngan nhung van bat duoc
// trang hoan toan la anh scan (text layer rong that su).
const MIN_TEXT_LAYER_CHARS = 10

export async function extractPdfText(
  filePath: string,
  onOcrStart?: () => void
): Promise<ExtractedChunk[]> {
  // pdfjs-dist v6+ chi phat hanh ESM (.mjs), phai dung dynamic import
  // ngay ca khi file nay duoc bundle ra CommonJS.
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(await readFile(filePath))

  const pdfjsPkgPath = require.resolve('pdfjs-dist/package.json')
  const standardFontDataUrl = pathToFileURL(
    join(dirname(pdfjsPkgPath), 'standard_fonts') + '/'
  ).href

  const loadingTask = pdfjsLib.getDocument({ data, standardFontDataUrl })
  const doc = await loadingTask.promise

  let ocrStarted = false
  const chunks: ExtractedChunk[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    try {
      const content = await page.getTextContent()
      let text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')

      if (text.trim().length < MIN_TEXT_LAYER_CHARS) {
        if (!ocrStarted) {
          ocrStarted = true
          onOcrStart?.()
        }
        const ocrResult = await ocrLimiter(() => ocrPdfPage(page))
        const viewport = page.getViewport({ scale: RENDER_SCALE })
        chunks.push({
          unitType: 'page',
          unitIndex: i,
          text: ocrResult.text,
          words: ocrResult.words,
          coordSpace: 'image_pixel',
          refWidth: viewport.width,
          refHeight: viewport.height
        })
      } else {
        // content.items co the co text trung lap (vd watermark lap lai) hoac
        // rong sau trim - van giu de khong lech thu tu, chi loai bbox rong.
        const words: ExtractedWord[] = []
        for (const item of content.items) {
          if (!('str' in item) || item.str.trim() === '') continue
          words.push({
            text: item.str,
            bbox: {
              x0: item.transform[4],
              y0: item.transform[5],
              x1: item.transform[4] + item.width,
              y1: item.transform[5] + item.height
            }
          })
        }
        const viewport = page.getViewport({ scale: 1 })
        chunks.push({
          unitType: 'page',
          unitIndex: i,
          text,
          words,
          coordSpace: 'pdf_point',
          refWidth: viewport.width,
          refHeight: viewport.height
        })
      }
    } catch (err) {
      console.error(`[textExtraction] pdf page ${i} failed:`, err)
      chunks.push({ unitType: 'page', unitIndex: i, text: '' })
    } finally {
      page.cleanup()
    }
  }
  await loadingTask.destroy()

  return chunks
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ocrPdfPage(page: any): ReturnType<typeof recognizeImageWithWords> {
  const pngBuffer = await renderPageToPngBuffer(page, RENDER_SCALE)
  return recognizeImageWithWords(pngBuffer)
}
