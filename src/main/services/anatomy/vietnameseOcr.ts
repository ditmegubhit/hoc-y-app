import type { PaddleOcrLine } from './paddleOcrClient'
import { normalizeLabel, suggestVietnameseLabel } from './vietnameseLabels'
import { recognizeLabelCrops, terminateLabelRecognizer, type RecognizeOptions } from '../ocr-vi/labelRecognizer'

// API cu giu nguyen cho code cu (detectPage, scanPage): doc lai CHI cac o chu do PaddleOCR phat hien
// (OCR ca trang de nham hoa van thanh chu). Ben trong dung bo nhan dang moi o ../ocr-vi/labelRecognizer
// (VietOCR + Tesseract vie, bo phieu, tu dien). Chu PaddleOCR chi la phuong an cuoi khi khong doc duoc.

const MIN_USABLE_CONFIDENCE = 0.35

export async function rereadVietnameseLines(png: Buffer, lines: PaddleOcrLine[], options: RecognizeOptions = {}): Promise<PaddleOcrLine[]> {
  if (lines.length === 0) return []
  const readings = await recognizeLabelCrops(png, lines.map((line) => line.box), options)
  return lines.map((line, index) => {
    const reading = readings[index]
    const letters = (reading?.text.match(/\p{L}/gu) ?? []).length
    const usable = reading != null && letters >= 2 && reading.confidence >= MIN_USABLE_CONFIDENCE
    return usable
      ? { ...line, text: reading.text, score: reading.confidence }
      : { ...line, text: suggestVietnameseLabel(line.text, options.additionalTerms) ?? normalizeLabel(line.text), score: Math.min(line.score, 0.54) }
  })
}

export async function terminateVietnameseOcr(): Promise<void> {
  await terminateLabelRecognizer()
}
