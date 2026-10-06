import { writeFileSync } from 'node:fs'
import type { ScenarioContext, StepFn } from './practiceUiScenario'
import type { Shared } from './practiceUiSteps'

// Muc (e1, e2, d1-d3): man file, xem trang vua khit, quet that.

export async function runScanSteps(step: StepFn, ctx: ScenarioContext, shared: Shared): Promise<void> {
  const { db, click, h } = ctx
  const { evaluate, until, sleep, shot } = h
  const { ids, openFile } = shared

  const actionStates = (): Promise<{ label: string; disabled: boolean; title: string }[]> =>
    evaluate("[...document.querySelectorAll('.practice-action-bar .practice-action')].map(b => ({ label: b.textContent.trim(), disabled: b.disabled, title: b.closest('.practice-action-wrap')?.title || '' }))")

  await step('e1', 'Man file: 6 nut dung trang thai truoc khi quet + tooltip', async () => {
    await openFile(ids.fileHeThan)
    await until("document.querySelector('.practice-viewer-img')", 15000, 'anh trang')
    const states = await actionStates()
    const labels = states.map((s) => s.label)
    const want = ['Tạo bài thi', 'Tạo đáp án', 'Sửa đáp án', 'Làm bài', 'Lịch sử & ôn câu sai', 'Quét lại từ đầu']
    if (JSON.stringify(labels) !== JSON.stringify(want)) throw new Error('nut: ' + JSON.stringify(labels))
    const by = Object.fromEntries(states.map((s) => [s.label, s]))
    if (!by['Tạo bài thi'].disabled || !by['Tạo bài thi'].title) throw new Error('Tao bai thi phai tat + tooltip khi chua co cau')
    if (by['Tạo đáp án'].disabled) throw new Error('Tao dap an phai bat')
    if (!by['Sửa đáp án'].disabled || !by['Sửa đáp án'].title) throw new Error('Sua dap an phai tat khi chua quet')
    if (!by['Làm bài'].disabled || !by['Làm bài'].title) throw new Error('Lam bai phai tat khi chua co bo de')
    if (by['Lịch sử & ôn câu sai'].disabled || by['Quét lại từ đầu'].disabled) throw new Error('Lich su/Quet lai phai bat')
    await shot('e1-file-before-scan')
    return states.map((s) => s.label + (s.disabled ? ' [tat: ' + s.title.slice(0, 40) + ']' : ' [bat]')).join('; ')
  })

  await step('e2', 'Trang xem vua khit khung + zoom Ctrl+lan + nut Vua khit', async () => {
    await until("document.querySelector('.practice-viewer-img')", 15000)
    const geom = (): Promise<any> => evaluate(`(() => {
      const st = document.querySelector('.practice-viewer-stage').getBoundingClientRect()
      const imEl = document.querySelector('.practice-viewer-img'); const im = imEl.getBoundingClientRect()
      const page = document.querySelector('.practice-file-page')
      return { st: { w: st.width, h: st.height, l: st.left, t: st.top }, im: { w: im.width, h: im.height },
        ratioNat: imEl.naturalWidth / imEl.naturalHeight, zoom: document.querySelector('.practice-viewer-zoomvalue').textContent,
        docScroll: document.documentElement.scrollHeight - innerHeight, pageScroll: page.scrollHeight - page.clientHeight }
    })()`)
    const g0 = await geom()
    const ratioDisplay = g0.im.w / g0.im.h
    if (Math.abs(ratioDisplay - g0.ratioNat) > 0.01) throw new Error(`Ti le anh bi keo gian: ${ratioDisplay} vs ${g0.ratioNat}`)
    if (g0.im.w > g0.st.w + 1 || g0.im.h > g0.st.h + 1) throw new Error('Anh tran khung: ' + JSON.stringify(g0))
    if (g0.docScroll > 1 || g0.pageScroll > 1) throw new Error('Trang phai cuon: ' + JSON.stringify(g0))
    await shot('e2-fit')
    const cx = Math.round(g0.st.l + g0.st.w / 2)
    const cy = Math.round(g0.st.t + g0.st.h / 2)
    for (let i = 0; i < 4; i++) {
      h.win.webContents.sendInputEvent({ type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: 120, wheelTicksY: 1, modifiers: ['control'], canScroll: true } as never)
      await sleep(80)
    }
    await sleep(300)
    let g1 = await geom()
    let how = 'sendInputEvent'
    if (g1.zoom === '100%') {
      how = 'WheelEvent gia lap'
      await evaluate(`document.querySelector('.practice-viewer-stage').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, clientX: ${cx}, clientY: ${cy}, bubbles: true, cancelable: true }))`)
      await sleep(200)
      g1 = await geom()
    }
    if (g1.zoom === '100%' || g1.im.w <= g0.im.w) throw new Error('Ctrl+lan khong zoom: ' + JSON.stringify(g1))
    await shot('e2-zoomed')
    await click('Vừa khít', '.practice-viewer-controls')
    await sleep(250)
    const g2 = await geom()
    if (g2.zoom !== '100%' || Math.abs(g2.im.w - g0.im.w) > 1) throw new Error('Vua khit khong ve lai: ' + JSON.stringify(g2))
    return `fit ${Math.round(g0.im.w)}x${Math.round(g0.im.h)} trong khung ${Math.round(g0.st.w)}x${Math.round(g0.st.h)}, ti le giu, khong cuon; zoom (${how}) -> ${g1.zoom}; Vua khit -> ${g2.zoom}`
  })

  const scanStats = (fileId: string): Record<string, unknown> => {
    const rows = db.prepare("SELECT page_number AS page, COUNT(*) AS n, SUM(suspect) AS s, SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS c FROM practice_regions WHERE file_id = ? GROUP BY page_number ORDER BY page_number").all(fileId) as { page: number; n: number; s: number; c: number }[]
    return Object.fromEntries(rows.map((r) => ['p' + r.page, { regions: r.n, suspect: r.s, autoQuestions: r.c }]))
  }
  const dumpRegions = (fileId: string, name: string): void => {
    const rows = db.prepare('SELECT page_number AS page, raw_text, answer_text, status, suspect, suspect_reasons_json, leader_score, confidence FROM practice_regions WHERE file_id = ? ORDER BY page_number, id').all(fileId)
    writeFileSync(h.dirs.root + '\\scan-' + name + '.json', JSON.stringify(rows, null, 1))
  }
  const doneDialog = "document.querySelector('.practice-dialog')?.innerText.includes('Đã tạo đáp án') || document.querySelector('.practice-dialog')?.innerText.includes('không thành công')"

  await step('d1', 'Quet that (UI): tien do + huy', async () => {
    await openFile(ids.fileHeThan)
    await until("document.querySelector('.practice-viewer-img')", 15000)
    await click('Tạo đáp án', '.practice-action-bar')
    await until("document.querySelector('.practice-dialog')?.innerText.includes('Đang tạo đáp án')", 10000, 'hop tien do')
    await shot('d1-progress-start')
    const t0 = Date.now()
    let firstPageMs = 0
    for (let i = 0; i < 700; i++) {
      const st = db.prepare('SELECT scan_last_page AS p FROM practice_files WHERE node_id = ?').get(ids.fileHeThan) as { p: number }
      if (st.p >= 1) { firstPageMs = Date.now() - t0; break }
      await sleep(250)
    }
    if (!firstPageMs) throw new Error('Qua 175s chua xong trang 1 (OCR treo?)')
    await shot('d1-progress-after-p1')
    const progressText = await evaluate("document.querySelector('.practice-progress-text')?.textContent")
    await click('Huỷ quét', '.practice-dialog')
    await until("document.querySelector('.practice-dialog')?.innerText.includes('Đã huỷ quét') || document.querySelector('.practice-dialog')?.innerText.includes('Đã tạo đáp án')", 120000, 'ket qua huy')
    const cancelTitle = await evaluate("document.querySelector('.practice-dialog h3').textContent")
    await shot('d1-cancelled')
    await click(cancelTitle === 'Đã huỷ quét' ? 'Đóng' : 'Để sau', '.practice-dialog')
    const after = db.prepare('SELECT scan_last_page AS p, scan_status AS s, scan_completed AS c FROM practice_files WHERE node_id = ?').get(ids.fileHeThan) as { p: number; s: string; c: number }
    return `tien do "${progressText}"; trang 1 xong sau ${firstPageMs}ms; sau huy: "${cancelTitle}" lastPage=${after.p} status=${after.s} completed=${after.c}`
  })

  await step('d2', 'Quet tiep (chay lai) den het file He than + thong ke', async () => {
    const before = db.prepare('SELECT scan_last_page AS p, scan_completed AS c FROM practice_files WHERE node_id = ?').get(ids.fileHeThan) as { p: number; c: number }
    let dt = 0
    let msg = ''
    if (before.c !== 1) {
      await until("window.__h.btn('Tạo đáp án', '.practice-action-bar')", 8000)
      const t0 = Date.now()
      await click('Tạo đáp án', '.practice-action-bar')
      await until("document.querySelector('.practice-dialog')", 10000, 'hop tien do lan 2')
      await until(doneDialog, 600000, 'quet xong')
      const title = await evaluate("document.querySelector('.practice-dialog h3').textContent")
      msg = await evaluate("document.querySelector('.practice-dialog p').textContent")
      dt = Date.now() - t0
      await shot('d2-scan-done')
      if (title !== 'Đã tạo đáp án nháp') throw new Error('ket qua quet: ' + title + ' - ' + msg)
      await click('Để sau', '.practice-dialog')
    }
    dumpRegions(ids.fileHeThan, 'he-than')
    const total = db.prepare("SELECT COUNT(*) AS n, SUM(suspect) AS s, SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS c FROM practice_regions WHERE file_id = ?").get(ids.fileHeThan) as { n: number; s: number; c: number }
    const pagesScanned = 3 - before.p
    return `tiep tuc tu trang ${before.p + 1}: ${pagesScanned} trang trong ${Math.round(dt / 1000)}s; TONG ${total.n} vung, ${total.s} nghi rac, ${total.c} cau tu tao; theo trang ${JSON.stringify(scanStats(ids.fileHeThan))}; "${msg.slice(0, 70)}"`
  })

  await step('d3', 'Quet M11 (2 trang) qua UI + thong ke', async () => {
    await openFile(ids.fileM11)
    await until("document.querySelector('.practice-viewer-img')", 15000)
    const t0 = Date.now()
    await click('Tạo đáp án', '.practice-action-bar')
    await until(doneDialog, 600000, 'quet M11 xong')
    const title = await evaluate("document.querySelector('.practice-dialog h3').textContent")
    const dt = Date.now() - t0
    if (title !== 'Đã tạo đáp án nháp') throw new Error('ket qua quet M11: ' + title)
    await click('Để sau', '.practice-dialog')
    dumpRegions(ids.fileM11, 'm11')
    return `${Math.round(dt / 1000)}s cho 2 trang; theo trang ${JSON.stringify(scanStats(ids.fileM11))}`
  })
}

// Chan doan nguon nhan dang: VietOCR co nap duoc trong Electron khong (bang chung: nguon cua ket qua bo phieu).
export async function diagnoseRecognizer(step: StepFn, ctx: ScenarioContext, shared: Shared): Promise<void> {
  const { db, h } = ctx
  await step('d4', 'Nguon nhan dang: VietOCR hay fallback Tesseract', async () => {
    const { renderPdfPageAsPng, RENDER_SCALE } = await import('./services/textExtraction/pdfRender')
    const { recognizeLabelCrops } = await import('./services/ocr-vi/labelRecognizer')
    const stored = (db.prepare('SELECT stored_path FROM practice_files WHERE node_id = ?').get(shared.ids.fileHeThan) as { stored_path: string }).stored_path
    const png = await renderPdfPageAsPng(stored, 1, RENDER_SCALE)
    const rows = db.prepare("SELECT label_box_json FROM practice_regions WHERE file_id = ? AND page_number = 1 AND suspect = 0 LIMIT 12").all(shared.ids.fileHeThan) as { label_box_json: string }[]
    const boxes = rows.map((r) => JSON.parse(r.label_box_json))
    const t0 = Date.now()
    const withViet = await recognizeLabelCrops(png, boxes)
    const msViet = Date.now() - t0
    const t1 = Date.now()
    const tessOnly = await recognizeLabelCrops(png, boxes, { disableVietOcr: true })
    const msTess = Date.now() - t1
    const count = (list: { source: string }[]): string => JSON.stringify(list.reduce<Record<string, number>>((acc, x) => { acc[x.source] = (acc[x.source] ?? 0) + 1; return acc }, {}))
    const usedViet = withViet.some((r) => r.source.includes('vietocr') || r.alternatives.some((a) => a.source === 'vietocr'))
    if (!usedViet) throw new Error('VietOCR KHONG chay trong Electron (chi Tesseract): ' + count(withViet))
    // Fallback: thieu model VietOCR -> van doc duoc bang Tesseract (khong nem loi).
    const missing = { encoder: 'Z:/khong/co/encoder.onnx', decoder: 'Z:/khong/co/decoder.onnx', vocab: 'Z:/khong/co/vocab.txt' }
    const fallback = await recognizeLabelCrops(png, boxes, { vietOcrPaths: missing })
    const fallbackOk = fallback.filter((r) => r.text.length > 0).length
    if (fallbackOk < Math.ceil(boxes.length / 2) || fallback.some((r) => r.source.includes('vietocr'))) throw new Error('Fallback Tesseract loi: ' + count(fallback))
    return `${boxes.length} o: voi VietOCR ${msViet}ms nguon ${count(withViet)}; chi Tesseract ${msTess}ms nguon ${count(tessOnly)}; thieu model -> fallback ${count(fallback)} (${fallbackOk}/${boxes.length} co chu)`
  })
  void h
}
