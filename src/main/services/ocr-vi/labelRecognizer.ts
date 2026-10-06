import { existsSync } from 'node:fs'
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import { loadImage, type Canvas } from '@napi-rs/canvas'
import type { Rect } from '../../../shared/types/anatomyQuiz'
import { tessdataDir } from '../ocr/resourcePaths'
import { normalizeLabel } from '../anatomy/vietnameseLabels'
import { prepareLine } from './linePrep'
import { vietOcrPaths } from './modelPaths'
import { VietOcrEngine, type VietOcrPaths } from './vietocrOnnx'
import { combine } from './readingCombiner'
import type { Reading } from './voting'
import type { LabelRecognition } from './readingCombiner'

// Nhan dang chu cac o nhan (da biet vi tri) cho khu Thuc hanh.
// Hai bo doc doc lap roi bo phieu: VietOCR (ONNX, rat tot chu thuong/viet tat co dau) va Tesseract vie
// (tot chu HOA co dau). Bo phieu chi CHON ung vien (uu tien thuat ngu giai phau, am tiet hop le, dong thuan),
// sau do ap tu dien khoi phuc dau khi khop duy nhat. Neu thieu model VietOCR/onnxruntime thi tu dong
// chi dung Tesseract (da cai tien tien xu ly).

export type { LabelRecognition } from './readingCombiner'

export interface RecognizeOptions {
  /** Thuat ngu tu hoc tu dap an da duyet (xem learnTermsFromAnswers). */
  additionalTerms?: readonly string[]
  /** Chi dung Tesseract (kiem tra/bench). */
  disableVietOcr?: boolean
  /** Ghi de duong dan model VietOCR (bench). */
  vietOcrPaths?: VietOcrPaths
  /** Chi dung VietOCR (bench). */
  disableTesseract?: boolean
}

const PAD_RATIO = 0.12
const TESSERACT_HEIGHT = 64

let queue: Promise<unknown> = Promise.resolve()
let tesseractPromise: Promise<Worker> | null = null
let vietPromise: Promise<VietOcrEngine | null> | null = null
let vietPathsKey = ''
let vietWarned = false

function tesseract(): Promise<Worker> {
  if (!tesseractPromise) {
    tesseractPromise = createWorker(['vie'], OEM.LSTM_ONLY, { langPath: tessdataDir(), gzip: false, cacheMethod: 'none', logger: () => {} })
      .then(async (worker) => {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, preserve_interword_spaces: '1' })
        return worker
      })
      .catch((error) => { tesseractPromise = null; throw error })
  }
  return tesseractPromise
}

function vietOcr(paths: VietOcrPaths): Promise<VietOcrEngine | null> {
  const key = `${paths.encoder}|${paths.decoder}`
  if (vietPromise && vietPathsKey !== key) { const old = vietPromise; vietPromise = null; void old.then((e) => e?.dispose()) }
  if (!vietPromise) {
    vietPathsKey = key
    vietPromise = (async () => {
      if (![paths.encoder, paths.decoder, paths.vocab].every((p) => existsSync(p))) {
        if (!vietWarned) { vietWarned = true; console.warn('[ocr-vi] Thieu model VietOCR, chi dung Tesseract:', paths.encoder) }
        return null
      }
      try {
        return await VietOcrEngine.load(paths, { maxWidth: 512 })
      } catch (error) {
        if (!vietWarned) { vietWarned = true; console.warn('[ocr-vi] Khong nap duoc VietOCR/onnxruntime, chi dung Tesseract:', error) }
        return null
      }
    })()
  }
  return vietPromise
}

async function readWithTesseract(worker: Worker, crop: Canvas): Promise<{ text: string; confidence: number }> {
  const { data } = await worker.recognize(crop.toBuffer('image/png'))
  return { text: normalizeLabel(data.text), confidence: Math.max(0, Math.min(1, data.confidence / 100)) }
}

const cleanEdges = (text: string): string => text.replace(/^[^\p{L}\p{N}(]+|[^\p{L}\p{N})]+$/gu, '')

/** Doc nhieu o nhan tren 1 anh trang (PNG) theo toa do pixel anh. Thu tu ket qua = thu tu `boxes`. */
export function recognizeLabelCrops(png: Buffer, boxes: Rect[], opts: RecognizeOptions = {}): Promise<LabelRecognition[]> {
  const run = queue.then(async (): Promise<LabelRecognition[]> => {
    if (boxes.length === 0) return []
    const image = await loadImage(png)
    const extra = opts.additionalTerms ?? []
    const viet = opts.disableVietOcr ? null : await vietOcr(opts.vietOcrPaths ?? vietOcrPaths())
    const tess = opts.disableTesseract ? null : await tesseract()
    const results: LabelRecognition[] = []
    for (const box of boxes) {
      const readings: Reading[] = []
      try {
        if (viet) {
          const prepared = prepareLine(image, box, { padRatio: PAD_RATIO, targetHeight: 0, mode: 'auto' })
          if (prepared) {
            const r = await viet.recognize(prepared.canvas)
            readings.push({ text: cleanEdges(r.text), confidence: r.confidence, source: 'vietocr' })
          }
        }
        if (tess) {
          const prepared = prepareLine(image, box, { padRatio: PAD_RATIO, targetHeight: TESSERACT_HEIGHT, mode: 'auto', border: 10 })
          if (prepared) {
            const r = await readWithTesseract(tess, prepared.canvas)
            readings.push({ text: cleanEdges(r.text), confidence: r.confidence, source: 'tesseract' })
          }
        }
      } catch (error) {
        console.warn('[ocr-vi] Loi doc 1 o nhan:', error)
      }
      results.push(combine(readings, extra))
    }
    return results
  })
  queue = run.catch(() => undefined)
  return run
}

export async function terminateLabelRecognizer(): Promise<void> {
  await queue
  const t = tesseractPromise; tesseractPromise = null
  const v = vietPromise; vietPromise = null
  if (t) await t.then((worker) => worker.terminate()).catch(() => undefined)
  if (v) await v.then((engine) => engine?.dispose()).catch(() => undefined)
}
