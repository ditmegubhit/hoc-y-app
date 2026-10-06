import { createCanvas, loadImage } from '@napi-rs/canvas'
import { renderPdfPageAsPng, RENDER_SCALE } from '../textExtraction/pdfRender'
import { recognizeImageLines } from '../anatomy/paddleOcrClient'
import { rereadVietnameseLines } from '../anatomy/vietnameseOcr'
import { suggestVietnameseLabel, learnTermsFromAnswers } from '../anatomy/vietnameseLabels'
import { getDb } from '../../db'
import { analyzePageLabels } from './pageAnalysis'
import { extractVectorShapes } from './vectorShapes'
import { JUNK_REASON_TEXT, RepeatTracker } from './junkFilter'
import { assessAnatomyRelevance, RELEVANCE_REASON_TEXT } from './relevanceFilter'
import type { GroupFragment } from './labelGrouping'
import type { RgbaImage } from './leaderLine'
import type { DetectedRegion } from './autoDraft'

// Pipeline do chu cua khu Thuc hanh: PaddleOCR (o chu) + Tesseract vie (doc lai, TUNG DONG) -> gom chu
// theo hinh khoi (hop vector/hop tim bang anh: moi hop = 1 vung, nhieu dong ghep thanh 1 cau; panelRegions)
// -> manh con lai gom/tach bang duong dan (labelGrouping) -> cham duong dan (vector neu co, khong thi
// leaderLine bang anh) -> co nghi rac + ly do (junkFilter).
// Vung nghi rac KHONG bi xoa; autoDraft chi tu tao cau hoi cho vung khong nghi rac.
//
// Chu lap lai o vi tri gan giong tren nhieu trang (tieu de/chan trang/logo) duoc nhan ra bang
// RepeatTracker giu trong bo nho theo tung file PDF trong luc quet: chi co tu trang thu 3 tro di
// (hoac sau khi da thay du so trang) moi bi danh dau; quet lai trang khong tinh trung.

export interface ScannedPage {
  refWidth: number
  refHeight: number
  regions: DetectedRegion[]
  /** Cum chu bi lop loc lien quan giai phau LOAI han (khong tao vung) - de ghi nhat ky/thong ke. */
  filteredOut?: Array<{ text: string; reason: string }>
}

const repeatTrackers = new Map<string, RepeatTracker>()
const MAX_TRACKED_FILES = 8

function trackerFor(pdfPath: string): RepeatTracker {
  let tracker = repeatTrackers.get(pdfPath)
  if (!tracker) {
    if (repeatTrackers.size >= MAX_TRACKED_FILES) {
      const oldest = repeatTrackers.keys().next().value
      if (oldest !== undefined) repeatTrackers.delete(oldest)
    }
    tracker = new RepeatTracker()
    repeatTrackers.set(pdfPath, tracker)
  }
  return tracker
}

// Thuat ngu tu hoc: dap an user DA DUYET (reviewed=1, confirmed) cua moi file thuc hanh -> giup sua dau
// va chon ung vien OCR o cac lan quet sau. Cache ngan de khong truy van DB cho tung trang.
let learnedCache: { at: number; terms: string[] } | null = null
const LEARNED_TTL_MS = 60_000

function learnedTerms(): string[] {
  const now = Date.now()
  if (learnedCache && now - learnedCache.at < LEARNED_TTL_MS) return learnedCache.terms
  let terms: string[] = []
  try {
    const rows = getDb().prepare(
      "SELECT answer_text FROM practice_regions WHERE reviewed = 1 AND status = 'confirmed' AND answer_text IS NOT NULL"
    ).all() as Array<{ answer_text: string }>
    terms = learnTermsFromAnswers(rows.map((r) => r.answer_text)).map((t) => t.term)
  } catch {
    terms = []
  }
  learnedCache = { at: now, terms }
  return terms
}

export async function detectPracticePageRegions(pdfPath: string, pageNumber: number): Promise<ScannedPage> {
  // Doi tuong vector (hop/duong dan) cung he toa do anh render; trang scan khong co -> hop tim bang anh.
  const [png, vector] = await Promise.all([
    renderPdfPageAsPng(pdfPath, pageNumber, RENDER_SCALE),
    extractVectorShapes(pdfPath, pageNumber, RENDER_SCALE)
  ])
  const image = await loadImage(png)

  const paddleLines = await recognizeImageLines(png)
  const additionalTerms = learnedTerms()
  const readable = await rereadVietnameseLines(png, paddleLines.filter((line) => line.score >= 0.2), { additionalTerms })
  const fragments = readable.map((l): GroupFragment => ({ box: l.box, text: l.text, confidence: l.score }))

  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  const raw = ctx.getImageData(0, 0, image.width, image.height)
  const rgba: RgbaImage = { data: raw.data, width: image.width, height: image.height }

  const analysis = analyzePageLabels(rgba, fragments, { vector })
  const tracker = trackerFor(pdfPath)

  const filteredOut: Array<{ text: string; reason: string }> = []
  const regions: DetectedRegion[] = []
  for (const label of analysis.labels) {
    const text = suggestVietnameseLabel(label.text, additionalTerms) ?? label.text
    // Lop loc lien quan giai phau: cum chu khong lien quan giai phau thi loai han (khong tao vung).
    const relevance = assessAnatomyRelevance({ text, leaderScore: label.leader.score }, { additionalTerms })
    if (!relevance.relevant) {
      filteredOut.push({ text, reason: RELEVANCE_REASON_TEXT[relevance.reason!] })
      continue
    }
    const reasons = [...label.verdict.reasons]
    const repeated = tracker.add({
      pageNumber, text, box: label.box, pageWidth: image.width, pageHeight: image.height
    })
    if (repeated) reasons.push(JUNK_REASON_TEXT.repeated)
    // Vung da bi nghi rac: loc lan 2 o che do CHAT (chi giu thuat ngu giai phau day du / >= 2 tu giai phau).
    if (reasons.length > 0) {
      const strict = assessAnatomyRelevance({ text, leaderScore: label.leader.score, confidence: label.confidence }, { additionalTerms, strict: true })
      if (!strict.relevant) {
        filteredOut.push({ text, reason: RELEVANCE_REASON_TEXT[strict.reason!] })
        continue
      }
    }
    regions.push({
      rawText: text,
      labelBox: label.box,
      refWidth: image.width,
      refHeight: image.height,
      confidence: label.confidence,
      leaderScore: Math.round(label.leader.score * 1000) / 1000,
      suspect: reasons.length > 0,
      suspectReasons: reasons
    })
  }
  return { refWidth: image.width, refHeight: image.height, regions, filteredOut }
}
