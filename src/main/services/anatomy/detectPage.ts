import { loadImage } from '@napi-rs/canvas'
import { getAttachment } from '../../db/repositories/attachments.repo'
import { getWordPositions } from '../../db/repositories/wordPositions.repo'
import { replaceDetectedCandidates } from '../../db/repositories/anatomyCandidates.repo'
import { renderPdfPageAsPng, RENDER_SCALE } from '../textExtraction/pdfRender'
import { recognizeImageLines } from './paddleOcrClient'
import { clusterWordsIntoLabelBoxes, type LabelCluster, type RenderTarget } from './labelDetection'
import * as anatomyQuizRepo from '../../db/repositories/anatomyQuiz.repo'

// Diem tin cay toi thieu de coi 1 dong PaddleOCR doc duoc la chu thuc su, chu
// khong phai nhieu tu hoa van/nen anh chup (vd chu, xuong, ban ghi) - uoc
// luong ban dau tu quan sat thuc te, co the can tinh lai.
const PADDLE_OCR_MIN_SCORE = 0.55

/**
 * Do vi tri O CHU tren 1 trang, luu thanh candidate cho man hinh soan cau
 * hoi. Goi khi tac gia mo 1 trang trong man hinh soan (theo yeu cau, khong
 * phai job nen). Chi tim VI TRI CAN CHE - KHONG doan cau hoi/dap an (tac gia
 * tu chon 1 o + tu go dap an trong man hinh soan, xem AnatomyCandidateSidebar).
 *
 * Nguon o chu gom 2 phan:
 * 1. word_positions co san, CHI LAY loai 'pdf_point' (text layer PDF that,
 *    nhan in san go rieng) - gom cum qua clusterWordsIntoLabelBoxes vi pdf.js
 *    co the tach 1 nhan thanh nhieu item. BO QUA loai 'image_pixel' (ket qua
 *    Tesseract cu tu pipeline trich xuat chung cho trang scan) - toan la
 *    nhieu vun tu nen anh chup (da kiem chung tren du lieu that), PaddleOCR
 *    o (2) lam lai viec nay tot hon han nen khong can giu ban cu.
 * 2. PaddleOCR-json (deep learning, xem paddleOcrClient.ts) chay lai TRUC
 *    TIEP tren toan bo trang - phat hien duong bao (det model) gom duoc CA
 *    CUM/DONG chu thanh 1 o hoan chinh tot hon Tesseract rat nhieu tren anh
 *    chup chu viet tay. Loi 'text' nhan dien duoc chi la GOI Y THO (dict
 *    khong co dau tieng Viet) - tac gia tu sua lai khi go dap an.
 */
export async function detectLabelsForPage(attachmentId: string, pageNumber: number): Promise<void> {
  const attachment = getAttachment(attachmentId)
  if (!attachment) throw new Error('Khong tim thay file dinh kem.')

  const pngBuffer = await renderPdfPageAsPng(attachment.storedPath, pageNumber, RENDER_SCALE)
  const image = await loadImage(pngBuffer)
  const target: RenderTarget = { scale: RENDER_SCALE, width: image.width, height: image.height }

  const existing = getWordPositions('attachment', attachmentId, 'page', pageNumber).filter(
    (w) => w.coordSpace === 'pdf_point'
  )
  const existingClusters = clusterWordsIntoLabelBoxes(existing, target)

  const paddleLines = await recognizeImageLines(pngBuffer)
  const paddleClusters: LabelCluster[] = paddleLines
    .filter((l) => l.score >= PADDLE_OCR_MIN_SCORE)
    .map((l) => ({ box: l.box, text: l.text, coordSpace: 'image_pixel', confidence: l.score }))

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
}
