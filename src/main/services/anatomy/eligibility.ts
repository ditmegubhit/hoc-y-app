import { readFile } from 'node:fs/promises'
import { getAttachment } from '../../db/repositories/attachments.repo'
import * as eligibilityRepo from '../../db/repositories/anatomyEligibility.repo'
import type { AnatomyEligibility } from '../../../shared/types/anatomyQuiz'

type Matrix = [number, number, number, number, number, number]
const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]
]

export async function analyzeAnatomyEligibility(attachmentId: string): Promise<AnatomyEligibility> {
  const existing = eligibilityRepo.getEligibility(attachmentId)
  if (existing && existing.status !== 'analyzing') return existing
  const attachment = getAttachment(attachmentId)
  if (!attachment || attachment.fileType !== 'pdf') {
    return { status: 'ineligible', imagePageRatio: 0, analyzedPages: 0, totalPages: 0, needsSourceConfirmation: false }
  }
  eligibilityRepo.saveEligibility({ attachmentId, status: 'analyzing' })
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await readFile(attachment.storedPath)) })
    const doc = await loadingTask.promise
    let imagePages = 0
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const ops = await page.getOperatorList()
      let ctm: Matrix = [1, 0, 0, 1, 0, 0]
      const stack: Matrix[] = []
      let hasLargeImage = false
      for (let index = 0; index < ops.fnArray.length; index += 1) {
        const fn = ops.fnArray[index]
        const args = ops.argsArray[index] as unknown[]
        if (fn === pdfjs.OPS.save) stack.push([...ctm] as Matrix)
        else if (fn === pdfjs.OPS.restore) ctm = stack.pop() ?? ctm
        else if (fn === pdfjs.OPS.transform) ctm = multiply(ctm, args as Matrix)
        else if (
          fn === pdfjs.OPS.paintImageXObject ||
          fn === pdfjs.OPS.paintInlineImageXObject ||
          fn === pdfjs.OPS.paintImageMaskXObject
        ) {
          const area = Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])
          if (area / Math.max(1, viewport.width * viewport.height) >= 0.2) hasLargeImage = true
        }
      }
      if (hasLargeImage) imagePages += 1
      eligibilityRepo.saveEligibility({
        attachmentId, status: 'analyzing', analyzedPages: pageNumber, totalPages: doc.numPages,
        imagePageRatio: imagePages / pageNumber
      })
      page.cleanup()
    }
    const ratio = doc.numPages === 0 ? 0 : imagePages / doc.numPages
    await loadingTask.destroy()
    const status = ratio > 0.8 ? 'eligible' : 'ineligible'
    eligibilityRepo.saveEligibility({ attachmentId, status, imagePageRatio: ratio, analyzedPages: doc.numPages, totalPages: doc.numPages })
    return eligibilityRepo.getEligibility(attachmentId)!
  } catch (error) {
    eligibilityRepo.saveEligibility({ attachmentId, status: 'failed' })
    throw error
  }
}
