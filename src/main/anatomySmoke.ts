import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { getDb } from './db'
import { detectLabelsForPage } from './services/anatomy/detectPage'
import { createManualCandidate, listCandidatesForPage, setCandidateStatus } from './db/repositories/anatomyCandidates.repo'
import { renderPdfPageAsPng, RENDER_SCALE } from './services/textExtraction/pdfRender'
import { readLabelImage } from './services/anatomy/readLabelWithAi'
import { terminateVietnameseOcr } from './services/anatomy/vietnameseOcr'
import { terminatePaddleOcr } from './services/anatomy/paddleOcrClient'
import { runAnatomyUiSmoke } from './anatomyUiSmoke'
import { handleProcessStdioErrors } from './services/runtime/stdioErrors'

handleProcessStdioErrors(() => { terminatePaddleOcr(); app.exit(1) })

// Requires a snapshot made with scripts/prepare-anatomy-smoke.py. All writes
// stay in this snapshot; source attachments are opened read-only.
const directory = resolve('tmp/anatomy-ocr-test/app-data')
if (!existsSync(join(directory, 'hoc-y-app.sqlite3'))) throw new Error('Run scripts/prepare-anatomy-smoke.py first.')
mkdirSync(directory, { recursive: true })
app.setPath('userData', directory)
const pagesArg = process.argv.find((arg) => arg.startsWith('--pages='))?.split('=')[1] ?? '1,2,3,16,57,62'
const pages = pagesArg.split(',').map(Number)

async function main(): Promise<void> {
  const db = getDb()
  const attachment = db.prepare(`SELECT a.id, a.stored_path FROM attachments a JOIN lessons l ON l.id = a.lesson_id
    WHERE l.title = 'Nơi test app' AND a.file_type = 'pdf' ORDER BY a.created_at LIMIT 1`).get() as { id: string; stored_path: string } | undefined
  if (!attachment) throw new Error('Không tìm thấy PDF trong Nơi test app.')
  if (process.argv.includes('--ui')) {
    await runAnatomyUiSmoke(attachment.id)
    return
  }
  const report: Array<Record<string, unknown>> = []
  const before = db.prepare('SELECT COUNT(*) AS n FROM anatomy_questions WHERE attachment_id = ?').get(attachment.id) as { n: number }
  console.log(`Test snapshot: ${attachment.id}, ${before.n} existing questions`)
  if (!process.argv.includes('--vision-only')) {
    db.prepare('DELETE FROM anatomy_questions WHERE attachment_id = ?').run(attachment.id)
    db.prepare('DELETE FROM anatomy_label_candidates WHERE attachment_id = ?').run(attachment.id)
  }
  for (const pageNumber of process.argv.includes('--vision-only') ? [] : pages) {
    if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error('Invalid test page')
    const started = Date.now()
    await detectLabelsForPage(attachment.id, pageNumber)
    const candidates = listCandidatesForPage(attachment.id, pageNumber)
    report.push({ pageNumber, elapsedMs: Date.now() - started, candidates })
    console.log(`Page ${pageNumber}: ${candidates.length} regions, ${candidates.filter((c) => c.status === 'confirmed').length} automatic questions`)
    console.log(candidates.map((c) => `${c.rawText} [${c.confidence?.toFixed(2)}]`).join(' | '))
    if (pageNumber === 3) {
      for (const text of ['ĐM TM chậu ngoài', 'ĐM TM chậu trong']) {
        if (!candidates.some((c) => c.rawText === text)) throw new Error(`Multiline regression: missing ${text}`)
      }
      // Verify repeat-scan protection for all confirmed regions and one rejected.
      const pending = candidates.find((c) => c.status === 'pending')
      if (pending) setCandidateStatus(pending.id, 'rejected')
      const manualId = createManualCandidate({ attachmentId: attachment.id, pageNumber,
        rawText: '', labelBox: { x0: 5, y0: 5, x1: 40, y1: 25 }, refWidth: candidates[0].refWidth, refHeight: candidates[0].refHeight })
      await detectLabelsForPage(attachment.id, pageNumber)
      const rescanned = listCandidatesForPage(attachment.id, pageNumber)
      if (rescanned.length !== candidates.length + 1 || !rescanned.some((c) => c.id === manualId)) throw new Error('Rescan duplicated/lost regions')
      for (const saved of candidates.filter((c) => c.status === 'confirmed' || c.id === pending?.id)) {
        const retained = rescanned.find((c) => c.id === saved.id)
        if (!retained || retained.answerText !== saved.answerText || retained.status !== (saved.id === pending?.id ? 'rejected' : saved.status)) {
          throw new Error('Rescan changed a reviewed answer')
        }
      }
      console.log('Rescan: no duplicates; confirmed/rejected answers and manual regions preserved')
    }
  }
  if (process.argv.includes('--vision') || process.argv.includes('--vision-only')) {
    const png = await renderPdfPageAsPng(attachment.stored_path, 1, RENDER_SCALE)
    // Coordinates measured against page-1.png at scale 2, scaled by the service.
    for (const label of [{ text: 'đầu trên', box: { x0: 421, y0: 10, x1: 731, y1: 135 } },
      { text: 'mặt sau', box: { x0: 105, y0: 115, x1: 397, y1: 229 } }]) {
      const reading = await readLabelImage(png, label.box, 1190, 1684)
      report.push({ handwritingExpected: label.text, reading })
      console.log('Handwriting', label.text, JSON.stringify(reading))
      if (reading.text.toLocaleLowerCase('vi-VN') !== label.text) throw new Error(`Handwriting regression: ${label.text}`)
    }
  }
  const reportName = process.argv.includes('--vision-only') ? 'vision-report.json' : 'ocr-report.json'
  writeFileSync(join(directory, '..', reportName), JSON.stringify(report, null, 2))
}

app.whenReady().then(async () => {
  let exitCode = 0
  try { await main() } catch (error) { console.error(error); exitCode = 1 }
  finally { await terminateVietnameseOcr(); terminatePaddleOcr(); app.exit(exitCode) }
})
