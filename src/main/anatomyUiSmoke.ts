import { BrowserWindow, ipcMain } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadImage } from '@napi-rs/canvas'
import { getDb } from './db'
import { getAttachment } from './db/repositories/attachments.repo'
import { createManualCandidate } from './db/repositories/anatomyCandidates.repo'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'
import { IpcChannels } from '../shared/types/ipcChannels'
import { renderPdfPageAsPng, RENDER_SCALE } from './services/textExtraction/pdfRender'
import type { AnatomyTextReading } from '../shared/types/anatomyQuiz'

/** Exercise the real renderer/preload/SQLite save flow in the isolated snapshot.
 * Replay an authorized vision result: UI testing sends no further document data. */
export async function runAnatomyUiSmoke(attachmentId: string): Promise<void> {
  const attachment = getAttachment(attachmentId)!
  const db = getDb()
  db.prepare('DELETE FROM anatomy_questions WHERE attachment_id = ? AND page_number = 1').run(attachmentId)
  db.prepare('DELETE FROM anatomy_label_candidates WHERE attachment_id = ? AND page_number = 1').run(attachmentId)
  db.prepare("UPDATE lessons SET updated_at = datetime('now', '+1 day') WHERE id = ?").run(attachment.lessonId)
  const image = await loadImage(await renderPdfPageAsPng(attachment.storedPath, 1, RENDER_SCALE))
  const candidateId = createManualCandidate({ attachmentId, pageNumber: 1, rawText: 'chữ chưa rõ',
    labelBox: { x0: 421 * image.width / 1190, y0: 10 * image.height / 1684,
      x1: 731 * image.width / 1190, y1: 135 * image.height / 1684 }, refWidth: image.width, refHeight: image.height })
  createManualCandidate({ attachmentId, pageNumber: 1, rawText: 'vùng kế tiếp',
    labelBox: { x0: 105 * image.width / 1190, y0: 115 * image.height / 1684,
      x1: 397 * image.width / 1190, y1: 229 * image.height / 1684 }, refWidth: image.width, refHeight: image.height })
  const fixture = JSON.parse(readFileSync(resolve('tmp/anatomy-ocr-test/vision-report.json'), 'utf8')) as
    Array<{ handwritingExpected: string; reading: AnatomyTextReading }>
  const reading = fixture.find((entry) => entry.handwritingExpected === 'đầu trên')!.reading
  registerIpcHandlers()
  ipcMain.removeHandler(IpcChannels.anatomy.detectAllPages)
  ipcMain.handle(IpcChannels.anatomy.detectAllPages, () => ({ totalPages: 75, alreadyComplete: true }))
  ipcMain.removeHandler(IpcChannels.anatomy.readCandidateText)
  const pending: { release?: () => void } = {}
  let calls = 0
  ipcMain.handle(IpcChannels.anatomy.readCandidateText, (_event, payload: { candidateId: string }) => {
    if (payload.candidateId !== candidateId) throw new Error('Unexpected fixture region')
    calls++
    return new Promise<AnatomyTextReading>((resolveResult) => { pending.release = () => resolveResult(reading) })
  })
  const window = new BrowserWindow({ show: false, width: 1366, height: 900,
    webPreferences: { preload: resolve('out/preload/index.js'), sandbox: true, contextIsolation: true,
      nodeIntegration: false, backgroundThrottling: false } })
  const evaluate = (code: string): Promise<any> => window.webContents.executeJavaScript(code)
  const until = async (code: string): Promise<void> => {
    const deadline = Date.now() + 15000
    while (!await evaluate(code)) {
      if (Date.now() > deadline) throw new Error(`UI timeout: ${code}`)
      await new Promise((resolveWait) => setTimeout(resolveWait, 100))
    }
  }
  const click = async (text: string): Promise<void> => {
    const expression = `[...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(text)})`
    await until(`Boolean(${expression})`)
    await evaluate(`${expression}.click()`)
  }
  const answerInput = "document.querySelector('.anatomy-candidate-form input')"
  const setAnswer = async (value: string): Promise<void> => {
    await evaluate(`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(${answerInput}, ${JSON.stringify(value)}); ${answerInput}.dispatchEvent(new Event('input', { bubbles: true }))`)
  }
  const savedAnswer = (): unknown => db.prepare('SELECT answer_text FROM anatomy_questions WHERE candidate_id = ?').get(candidateId)
  try {
    await window.loadFile(resolve('out/renderer/index.html'))
    await until("[...document.querySelectorAll('.recent-lesson-item strong')].some(e => e.textContent === 'Nơi test app')")
    await evaluate("[...document.querySelectorAll('.recent-lesson-item strong')].find(e => e.textContent === 'Nơi test app').closest('button').click()")
    await until("[...document.querySelectorAll('.attachment-name')].some(e => e.textContent === 'He than - tiet nieu (tong hop).pdf')")
    await evaluate("[...document.querySelectorAll('.attachment-name')].find(e => e.textContent === 'He than - tiet nieu (tong hop).pdf').closest('.attachment-item').click()")
    await click('Chỉnh sửa Thi TH GP')
    await click('Bắt đầu ở trang này')
    await until(`${answerInput}?.value === 'chữ chưa rõ'`)
    await click('Đọc lại tiếng Việt / chữ viết tay bằng Claude')
    await until("document.querySelector('.anatomy-candidate-form button').disabled")
    while (!pending.release) await new Promise((r) => setTimeout(r, 20))
    await setAnswer('đáp án đang sửa')
    pending.release()
    await until("document.querySelector('.anatomy-candidate-form [role=status]')?.textContent.includes('đầu trên')")
    if (await evaluate(`${answerInput}.value`) !== 'đáp án đang sửa' || savedAnswer()) throw new Error('AI reading overwrote/auto-saved an answer')
    await until("document.querySelector('.anatomy-review-canvas-image')?.complete && document.querySelector('.anatomy-review-canvas-image').naturalWidth > 0")
    await evaluate("document.querySelector('.anatomy-candidate-form').scrollIntoView({ block: 'end' })")
    await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
    const formVisible = await evaluate("(() => { const b = document.querySelector('.anatomy-candidate-form').getBoundingClientRect(); return b.top >= -1 && b.bottom <= innerHeight + 1; })()")
    if (!formVisible) {
      console.log(await evaluate("JSON.stringify(['.anatomy-candidate-form','.lms-quiz-main','.lms-quiz-body','.lms-quiz'].map(s => { const e = document.querySelector(s), b = e.getBoundingClientRect(); return { selector:s, top:b.top,bottom:b.bottom,height:b.height,scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight }; }))"))
      throw new Error('Answer form is not reachable in the viewport')
    }
    // Hidden windows may return their last painted frame. Briefly show the test
    // window without focus so the screenshot reflects the current form.
    window.showInactive()
    await new Promise((r) => setTimeout(r, 300))
    writeFileSync(resolve('tmp/anatomy-ocr-test/ui.png'), (await window.webContents.capturePage()).toPNG())
    window.hide()
    await click('Dùng đáp án đề xuất')
    await until(`${answerInput}.value === 'đầu trên'`)
    await click('Lưu đáp án')
    await until("!document.querySelector('.anatomy-candidate-form button.btn-primary')?.disabled")
    if ((savedAnswer() as { answer_text?: string })?.answer_text !== 'đầu trên') throw new Error('UI failed to save accepted proposal')
    await click('Đọc lại tiếng Việt / chữ viết tay bằng Claude')
    while (calls < 2) await new Promise((r) => setTimeout(r, 20))
    await click('Tiếp theo')
    await until(`${answerInput}?.value !== 'đầu trên'`)
    const nextAnswer = await evaluate(`${answerInput}.value`)
    pending.release()
    await new Promise((r) => setTimeout(r, 300))
    if (await evaluate(`${answerInput}.value`) !== nextAnswer || await evaluate("Boolean(document.querySelector('.anatomy-candidate-form [role=status]'))")) {
      throw new Error('Late AI response affected another region')
    }
    console.log('UI passed: edit preserved, proposal applied explicitly, saved through IPC; late response ignored. Vision result replay only.')
  } catch (error) {
    writeFileSync(resolve('tmp/anatomy-ocr-test/ui-failure.png'), (await window.webContents.capturePage()).toPNG())
    throw error
  } finally { window.destroy() }
}
