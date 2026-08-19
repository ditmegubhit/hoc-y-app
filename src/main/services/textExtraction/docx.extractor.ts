import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import mammoth from 'mammoth'
import type { ExtractedChunk } from './index'

// Word chi luu ngat trang THU CONG (<w:br w:type="page"/>) ro rang trong XML.
// Ngat trang TU DONG (do noi dung day xuong) khong co marker co dinh trong
// XML theo dung nghia - NHUNG Word tu chen <w:lastRenderedPageBreak/> ngay
// truoc noi no tinh la bat dau trang moi tai lan luu gan nhat, nen dung ca 2
// loai marker nay cho phep tach trang kha sat voi so trang that trong Word,
// du khong hoan hao 100% neu file bi sua sau lan luu cuoi qua Word that.
type DocxToken = { type: 'text'; value: string } | { type: 'pageBreak' }

function collectDocxTokens(node: unknown, out: DocxToken[]): void {
  if (node == null) return
  if (Array.isArray(node)) {
    for (const item of node) collectDocxTokens(item, out)
    return
  }
  if (typeof node !== 'object') return

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key.startsWith('@_')) continue

    if (key === 'w:t') {
      if (typeof value === 'string') {
        out.push({ type: 'text', value })
      } else if (value && typeof value === 'object' && '#text' in (value as object)) {
        out.push({ type: 'text', value: String((value as Record<string, unknown>)['#text']) })
      }
      continue
    }

    if (key === 'w:lastRenderedPageBreak') {
      out.push({ type: 'pageBreak' })
      continue
    }

    if (key === 'w:br') {
      const items = Array.isArray(value) ? value : [value]
      for (const item of items) {
        const brType =
          item && typeof item === 'object' ? (item as Record<string, unknown>)['@_w:type'] : undefined
        if (brType === 'page') out.push({ type: 'pageBreak' })
      }
      continue
    }

    collectDocxTokens(value, out)
  }
}

// Khong loc bo trang rong va KHONG danh so lai - unitIndex phai giu dung vi
// tri thu tu (kha nang cao trung voi so trang that cua Word) de sau nay
// Selection.GoTo(wdGoToPage, ..., unitIndex) nhay dung cho.
function splitIntoPages(tokens: DocxToken[]): string[] {
  const pages: string[] = []
  let current: string[] = []
  for (const tok of tokens) {
    if (tok.type === 'pageBreak') {
      pages.push(current.join(' ').trim())
      current = []
    } else {
      current.push(tok.value)
    }
  }
  pages.push(current.join(' ').trim())
  return pages
}

export async function extractDocxText(filePath: string): Promise<ExtractedChunk[]> {
  try {
    const buffer = await readFile(filePath)
    const zip = await JSZip.loadAsync(buffer)
    const docFile = zip.files['word/document.xml']
    if (!docFile) throw new Error('word/document.xml khong ton tai trong file')

    const xml = await docFile.async('text')
    const parser = new XMLParser({ ignoreAttributes: false })
    const parsed: unknown = parser.parse(xml)

    const tokens: DocxToken[] = []
    collectDocxTokens(parsed, tokens)
    const pages = splitIntoPages(tokens)

    const totalChars = pages.reduce((sum, p) => sum + p.length, 0)
    if (totalChars === 0) throw new Error('Khong trich duoc text tu XML')

    return pages.map((text, i) => ({ unitType: 'docPage', unitIndex: i + 1, text }))
  } catch (err) {
    console.error('[textExtraction] docx XML parse that bai, fallback mammoth:', err)
    const result = await mammoth.extractRawText({ path: filePath })
    return [{ unitType: 'docPage', unitIndex: 1, text: result.value }]
  }
}
