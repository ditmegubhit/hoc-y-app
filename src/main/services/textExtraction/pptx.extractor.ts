import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'

// Chi lay text trong the <a:t> (DrawingML text run) trong tung file slideN.xml,
// bo qua thuoc tinh (@_...) va cac phan tu khac khong phai text hien thi.
function collectSlideText(node: unknown, out: string[]): void {
  if (node == null) return
  if (Array.isArray(node)) {
    for (const item of node) collectSlideText(item, out)
    return
  }
  if (typeof node !== 'object') return

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key.startsWith('@_')) continue
    if (key === 'a:t') {
      if (typeof value === 'string') {
        out.push(value)
      } else if (value && typeof value === 'object' && '#text' in (value as object)) {
        out.push(String((value as Record<string, unknown>)['#text']))
      }
      continue
    }
    collectSlideText(value, out)
  }
}

export async function extractPptxText(filePath: string): Promise<string> {
  const buffer = await readFile(filePath)
  const zip = await JSZip.loadAsync(buffer)

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(/slide(\d+)\.xml/.exec(a)?.[1] ?? 0)
      const nb = Number(/slide(\d+)\.xml/.exec(b)?.[1] ?? 0)
      return na - nb
    })

  const parser = new XMLParser({ ignoreAttributes: false })
  const slideTexts: string[] = []

  for (const name of slideFiles) {
    const xml = await zip.files[name].async('text')
    const parsed: unknown = parser.parse(xml)
    const texts: string[] = []
    collectSlideText(parsed, texts)
    slideTexts.push(texts.join(' '))
  }

  return slideTexts.join('\n\n')
}
