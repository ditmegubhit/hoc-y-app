import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import { recognizeImage } from '../ocr/ocrEngine'
import { ocrLimiter } from '../ocr/limiter'
import type { ExtractedChunk } from './index'

const MIN_TEXT_LAYER_CHARS = 10

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

interface RelationshipNode {
  '@_Type'?: string
  '@_Target'?: string
}

// Doc file .rels tuong ung 1 slide, tra ve danh sach path (trong zip) cua cac
// anh nhung THAT SU thuoc slide do (qua quan he r:embed), tranh OCR tran lan
// toan bo ppt/media/ gay trung/nham anh giua cac slide.
function extractImageTargets(parsedRels: unknown): string[] {
  const root = parsedRels as {
    Relationships?: { Relationship?: RelationshipNode | RelationshipNode[] }
  }
  const rel = root?.Relationships?.Relationship
  if (!rel) return []
  const list = Array.isArray(rel) ? rel : [rel]
  return list
    .filter((r) => typeof r['@_Type'] === 'string' && r['@_Type']!.endsWith('/image'))
    .map((r) => r['@_Target'])
    .filter((t): t is string => typeof t === 'string')
}

// Target trong .rels luon tuong doi so voi thu muc chua phan gia (ppt/slides/),
// khong phai so voi thu muc _rels/. Vd '../media/image1.png' tu 'ppt/slides'
// -> 'ppt/media/image1.png'. Mot so file co the dung target tuyet doi '/ppt/...'.
function resolveRelPath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const stack = baseDir.split('/').filter(Boolean)
  for (const part of target.split('/').filter(Boolean)) {
    if (part === '..') stack.pop()
    else if (part !== '.') stack.push(part)
  }
  return stack.join('/')
}

async function ocrSlideImages(zip: JSZip, slideName: string): Promise<string> {
  const slideNum = /slide(\d+)\.xml$/.exec(slideName)?.[1]
  if (!slideNum) return ''
  const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`
  const relsFile = zip.files[relsPath]
  if (!relsFile) return ''

  const parser = new XMLParser({ ignoreAttributes: false })
  const relsXml = await relsFile.async('text')
  const targets = extractImageTargets(parser.parse(relsXml))

  const texts: string[] = []
  for (const target of targets) {
    const mediaPath = resolveRelPath('ppt/slides', target)
    const mediaFile = zip.files[mediaPath]
    if (!mediaFile) continue
    try {
      const buffer = await mediaFile.async('nodebuffer')
      const text = await ocrLimiter(() => recognizeImage(buffer))
      if (text.trim()) texts.push(text)
    } catch (err) {
      console.error(`[textExtraction] pptx slide image OCR failed (${mediaPath}):`, err)
    }
  }
  return texts.join(' ')
}

export async function extractPptxText(
  filePath: string,
  onOcrStart?: () => void
): Promise<ExtractedChunk[]> {
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
  let ocrStarted = false
  const chunks: ExtractedChunk[] = []

  for (const name of slideFiles) {
    const slideNumber = Number(/slide(\d+)\.xml$/.exec(name)?.[1] ?? 0)
    const xml = await zip.files[name].async('text')
    const parsed: unknown = parser.parse(xml)
    const texts: string[] = []
    collectSlideText(parsed, texts)
    let slideText = texts.join(' ')

    if (slideText.trim().length < MIN_TEXT_LAYER_CHARS) {
      if (!ocrStarted) {
        ocrStarted = true
        onOcrStart?.()
      }
      slideText = await ocrSlideImages(zip, name)
    }
    chunks.push({ unitType: 'slide', unitIndex: slideNumber, text: slideText })
  }

  return chunks
}
