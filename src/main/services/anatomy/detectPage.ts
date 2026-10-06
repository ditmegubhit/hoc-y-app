import { loadImage } from '@napi-rs/canvas'
import { getAttachment } from '../../db/repositories/attachments.repo'
import { getWordPositions } from '../../db/repositories/wordPositions.repo'
import { replaceDetectedCandidates } from '../../db/repositories/anatomyCandidates.repo'
import { renderPdfPageAsPng, RENDER_SCALE } from '../textExtraction/pdfRender'
import { recognizeImageLines } from './paddleOcrClient'
import { clusterWordsIntoLabelBoxes, clusterLabelFragments, type LabelCluster, type RenderTarget } from './labelDetection'
import { rereadVietnameseLines } from './vietnameseOcr'
import { suggestVietnameseLabel } from './vietnameseLabels'
import * as anatomyQuizRepo from '../../db/repositories/anatomyQuiz.repo'

/** Tinh cum nhan cua 1 trang (khong ghi DB): text layer PDF + PaddleOCR + Tesseract.
 * Tach rieng de bo do OCR (ocrBench) dung lai dung pipeline that. */
export async function detectLabelClustersForPage(
  pdfPath: string,
  attachmentId: string,
  pageNumber: number
): Promise<{ clusters: LabelCluster[]; target: RenderTarget }> {
  const pngBuffer = await renderPdfPageAsPng(pdfPath, pageNumber, RENDER_SCALE)
  const image = await loadImage(pngBuffer)
  const target: RenderTarget = { scale: RENDER_SCALE, width: image.width, height: image.height }

  const existing = getWordPositions('attachment', attachmentId, 'page', pageNumber).filter(
    (w) => w.coordSpace === 'pdf_point'
  )
  const existingClusters = clusterWordsIntoLabelBoxes(existing, target)

  const paddleLines = await recognizeImageLines(pngBuffer)
  const readableLines = await rereadVietnameseLines(pngBuffer, paddleLines.filter((line) => line.score >= 0.2))
  const paddleClusters = clusterLabelFragments(readableLines.map((l): LabelCluster =>
    ({ box: l.box, text: l.text, coordSpace: 'image_pixel', confidence: l.score })))
    .map((cluster) => ({ ...cluster, text: suggestVietnameseLabel(cluster.text) ?? cluster.text }))

  // PDF text va OCR co the thay cung mot nhan. Loai o chong lan lon, uu tien
  // text layer vi noi dung/dau tieng Viet chinh xac hon.
  const overlapRatio = (a: LabelCluster, b: LabelCluster): number => {
    const x0 = Math.max(a.box.x0, b.box.x0)
    const y0 = Math.max(a.box.y0, b.box.y0)
    const x1 = Math.min(a.box.x1, b.box.x1)
    const y1 = Math.min(a.box.y1, b.box.y1)
    const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
    const smaller = Math.min(
      Math.max(1, (a.box.x1 - a.box.x0) * (a.box.y1 - a.box.y0)),
      Math.max(1, (b.box.x1 - b.box.x0) * (b.box.y1 - b.box.y0))
    )
    return intersection / smaller
  }
  const clusters = [...existingClusters]
  for (const candidate of paddleClusters) {
    if (!clusters.some((existingCluster) => overlapRatio(existingCluster, candidate) >= 0.7)) {
      clusters.push(candidate)
    }
  }
  return { clusters, target }
}

/** Detect label regions, join PDF/OCR fragments, and reread detector crops
 * with Vietnamese OCR. Only confident readings become automatic questions;
 * uncertain labels remain available for author review and optional AI reading. */
export async function detectLabelsForPage(attachmentId: string, pageNumber: number): Promise<void> {
  const attachment = getAttachment(attachmentId)
  if (!attachment) throw new Error('Khong tim thay file dinh kem.')

  const { clusters, target } = await detectLabelClustersForPage(attachment.storedPath, attachmentId, pageNumber)

  replaceDetectedCandidates(
    attachmentId,
    pageNumber,
    clusters.map((c) => ({
      attachmentId,
      pageNumber,
      rawText: c.text,
      labelBox: c.box,
      refWidth: target.width,
      refHeight: target.height,
      confidence: c.confidence ?? (c.coordSpace === 'pdf_point' ? 1 : null)
    }))
  )

  // Ban V2: nhap tu dong duoc dung ngay; nguoi dung chi sua nhung cau sai.
  anatomyQuizRepo.ensureAutoQuestionsForPage(attachmentId, attachment.lessonId, pageNumber)
  anatomyQuizRepo.refreshPageQuestionGeometry(attachmentId, pageNumber)
}
