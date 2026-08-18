import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

export async function extractPdfText(filePath: string): Promise<string> {
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

  const pageTexts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    pageTexts.push(text)
    page.cleanup()
  }
  await loadingTask.destroy()

  return pageTexts.join('\n\n')
}
