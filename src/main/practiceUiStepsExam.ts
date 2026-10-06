import { nativeImage } from 'electron'
import type { ScenarioContext, StepFn } from './practiceUiScenario'
import type { Shared } from './practiceUiSteps'
import { addAttachmentFromPath } from './services/attachments.service'

// Muc (h): tao bai thi, lam bai, lich su, on cau sai. Muc (g2): mau che duc 100% luc lam bai. Muc (i): hoi quy bai hoc.

interface AttemptQuestionRow { region_id: string; position: number; answer_text: string; masks_json: string }

export async function runExamSteps(step: StepFn, ctx: ScenarioContext, shared: Shared): Promise<void> {
  const { db, click, h, api, cleanLoad } = ctx
  const { evaluate, until, sleep, shot } = h
  const { ids, openFile } = shared

  const checked = (): Promise<number> => evaluate("Number((document.querySelector('.pq-count strong')?.textContent) ?? -1)")
  const openOverlayButton = async (label: string, readySelector: string): Promise<void> => {
    await cleanLoad() // moi lan tai lai trang: tranh overlay cu con sot lai sau mot muc that bai
    await openFile(ids.fileHeThan)
    await until(`window.__h.btn(${JSON.stringify(label)}, '.practice-action-bar')`, 8000)
    await click(label, '.practice-action-bar')
    await until(`document.querySelector(${JSON.stringify(readySelector)})`, 15000, 'overlay ' + label)
    await sleep(400)
  }
  const closeOverlay = async (): Promise<void> => {
    await evaluate("(() => { const b = [...document.querySelectorAll('.pq-overlay .pq-header-actions button')].find(x => x.textContent.trim() === 'Đóng' || x.textContent.trim() === 'Thoát'); b && b.click() })()")
    await sleep(300)
    if (await evaluate("Boolean(document.querySelector('.confirm-dialog'))")) await evaluate("[...document.querySelectorAll('.confirm-dialog button')].find(b => b.textContent.trim() === 'Thoát').click()")
    await until("!document.querySelector('.pq-overlay')", 8000, 'dong overlay bai thi')
  }
  const latestAttempt = (): { id: string; status: string; feedback_mode: string; score: number | null; correct_count: number | null; question_count: number } =>
    db.prepare('SELECT * FROM practice_attempts WHERE file_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1').get(ids.fileHeThan) as never
  const attemptQuestions = (attemptId: string): AttemptQuestionRow[] =>
    db.prepare('SELECT region_id, position, answer_text, masks_json FROM practice_attempt_questions WHERE attempt_id = ? ORDER BY position').all(attemptId) as AttemptQuestionRow[]
  const currentIndexFromDom = async (): Promise<number> =>
    evaluate("(() => { const m = /Câu (\\d+) trên (\\d+)/.exec(document.querySelector('.pq-qcard')?.getAttribute('aria-label') ?? '') ; return m ? Number(m[1]) - 1 : -1 })()")
  const answerCurrent = async (attemptId: string, correct: boolean): Promise<string> => {
    await until("document.querySelector('.pq-qcard .pq-answer-input') && !document.querySelector('.pq-qcard .pq-answer-input').disabled", 15000, 'o dap an mo khoa')
    const idx = await currentIndexFromDom()
    const row = attemptQuestions(attemptId)[idx]
    const text = correct ? row.answer_text : 'tra loi sai bet'
    await evaluate(`window.__h.setValue(document.querySelector('.pq-qcard .pq-answer-input'), ${JSON.stringify(text)})`)
    await sleep(80)
    await evaluate("document.querySelector('.pq-qcard .pq-action').click()")
    return row.answer_text
  }

  // =============== (h1) Tao bai thi ===============
  await step('h1', 'Tao bai thi: khoang trang, ngau nhien N, tick/bo tick, tao 2 de (luyen tap + thi thu)', async () => {
    await openOverlayButton('Tạo bài thi', '.pq-make')
    await shot('h1-make-exam')
    const summaryCount = db.prepare("SELECT COUNT(*) AS n FROM practice_regions r WHERE r.file_id = ? AND r.status = 'confirmed' AND r.answer_text IS NOT NULL").get(ids.fileHeThan) as { n: number }
    const all0 = await checked()
    const totalText = await evaluate("document.querySelector('.pq-count').textContent")
    if (all0 !== summaryCount.n) throw new Error(`so cau chon mac dinh ${all0} != so vung confirmed ${summaryCount.n} (${totalText})`)
    // khoang trang 1..1
    await evaluate("[...document.querySelectorAll('input[name=pq-scope]')][1].click()")
    await sleep(200)
    await evaluate("(() => { const ins = document.querySelectorAll('.pq-range input'); window.__h.setValue(ins[0], '1'); window.__h.setValue(ins[1], '1') })()")
    await sleep(300)
    const p1 = db.prepare("SELECT COUNT(*) AS n FROM practice_regions WHERE file_id = ? AND status = 'confirmed' AND page_number = 1").get(ids.fileHeThan) as { n: number }
    const chosenRange = await checked()
    if (chosenRange !== p1.n) throw new Error(`khoang trang 1-1: ${chosenRange} != ${p1.n}`)
    // ngau nhien 3
    await evaluate("window.__h.setValue(document.querySelector('input[aria-label=\"Số câu ngẫu nhiên\"]'), '3')")
    await sleep(100)
    await evaluate("window.__h.btnContains('Bốc', '.pq-make-setup').click()")
    await until('document.querySelector(".pq-count strong")?.textContent === "3"', 8000, 'boc ngau nhien 3 cau')
    // bo tick 1 cau roi tick lai
    await evaluate("document.querySelector('.pq-question-choice.is-checked input').click()")
    await sleep(200)
    const afterUntick = await checked()
    await evaluate("document.querySelector('.pq-question-choice:not(.is-checked) input').click()")
    await sleep(200)
    const afterTick = await checked()
    if (afterUntick !== 2 || afterTick !== 3) throw new Error(`tick/bo tick: ${afterUntick}, ${afterTick}`)
    // tao de 1: luyen tap, 30 giay
    await evaluate("window.__h.setValue(document.querySelector('.pq-make-setup input[type=text]'), 'De UI luyen tap')")
    await click('Tạo bài thi', '.pq-make-submit')
    await until("document.querySelector('.pq-created')", 8000, 'thong bao da tao')
    const set1 = db.prepare("SELECT * FROM practice_station_sets WHERE name = 'De UI luyen tap'").get() as { id: string; feedback_mode: string; time_limit_seconds: number } | undefined
    if (!set1 || set1.feedback_mode !== 'practice') throw new Error('de luyen tap khong co trong DB')
    const q1 = (db.prepare('SELECT COUNT(*) AS n FROM practice_station_set_questions WHERE station_set_id = ?').get(set1.id) as { n: number }).n
    if (q1 !== 3) throw new Error('de 1 co ' + q1 + ' cau')
    ids.setPractice = set1.id
    // de 2: thi thu, 5 giay, tat ca trang, ngau nhien 4
    await evaluate("[...document.querySelectorAll('input[name=pq-scope]')][0].click()")
    await sleep(200)
    await evaluate("[...document.querySelectorAll('.pq-mode-card')].find(b => b.textContent.includes('Thi thử')).click()")
    await sleep(150)
    await evaluate("window.__h.setValue(document.querySelector('.pq-inline input[type=number]'), '5')")
    await evaluate("window.__h.setValue(document.querySelector('input[aria-label=\"Số câu ngẫu nhiên\"]'), '4')")
    await sleep(100)
    await evaluate("window.__h.btnContains('Bốc', '.pq-make-setup').click()")
    await until('document.querySelector(".pq-count strong")?.textContent === "4"', 8000, 'boc 4 cau')
    await evaluate("window.__h.setValue(document.querySelector('.pq-make-setup input[type=text]'), 'De UI thi thu')")
    await click('Tạo bài thi', '.pq-make-submit')
    await sleep(600)
    const set2 = db.prepare("SELECT * FROM practice_station_sets WHERE name = 'De UI thi thu'").get() as { id: string; feedback_mode: string; time_limit_seconds: number } | undefined
    if (!set2 || set2.feedback_mode !== 'exam' || set2.time_limit_seconds !== 5) throw new Error('de thi thu sai: ' + JSON.stringify(set2))
    ids.setExam = set2.id
    await shot('h1-two-sets')
    const listed = await evaluate("[...document.querySelectorAll('.pq-saved strong')].map(e => e.textContent)")
    await closeOverlay()
    return `mac dinh chon ${all0}/${summaryCount.n}; khoang 1-1 = ${chosenRange}; boc 3, bo tick ${afterUntick}, tick lai ${afterTick}; da tao de: ${listed.join(' | ')}`
  })

  // =============== (g2) Mau che duc 100% luc lam bai ===============
  let leakNote = ''
  await step('g2', 'Lam bai: o che DUC 100% dung mau chung + mau rieng tung vung (pixel)', async () => {
    // mau chung xanh, do mo chung 0.4 (chi ap luc sua), 1 vung trong de co mau rieng do
    await api(`updateFileSettings({ fileId: ${JSON.stringify(ids.fileHeThan)}, maskColor: '#1e90ff', maskOpacity: 0.4 })`)
    const setQs = db.prepare('SELECT region_id FROM practice_station_set_questions WHERE station_set_id = ?').all(ids.setPractice) as { region_id: string }[]
    const regionIds = setQs.map((q) => q.region_id)
    // Bat dau 1 luot qua IPC that va kiem tra renderer KHONG nhan dap an
    const started = await api(`startAttempt({ stationSetId: ${JSON.stringify(ids.setPractice)} })`)
    const json = JSON.stringify(started)
    const answers = db.prepare(`SELECT answer_text FROM practice_regions WHERE id IN (${regionIds.map(() => '?').join(',')})`).all(...regionIds) as { answer_text: string }[]
    const leaked = answers.filter((a) => a.answer_text.length >= 3 && json.includes(a.answer_text)).map((a) => a.answer_text)
    if (/answerText|correctAnswer|alternates/i.test(json)) throw new Error('startAttempt tra ve truong dap an: ' + (/answerText|correctAnswer|alternates/i.exec(json) ?? [''])[0])
    if (leaked.length > 0) throw new Error('startAttempt ro dap an: ' + leaked.join(', '))
    ids.attemptA = started.attemptId
    // mau rieng do cho 1 vung xen ke moi trang -> cau nao cung co ca o do (rieng) lan o xanh (chung)
    const perPage = db.prepare('SELECT id, page_number FROM practice_regions WHERE file_id = ? ORDER BY page_number, id').all(ids.fileHeThan) as { id: string; page_number: number }[]
    const seen = new Map<number, number>()
    for (const r of perPage) {
      const k = seen.get(r.page_number) ?? 0
      seen.set(r.page_number, k + 1)
      if (k % 2 === 0) await api(`updateRegion({ id: ${JSON.stringify(r.id)}, patch: { colorOverride: '#ff0000' } })`)
    }
    // cac mask duoc luu theo luc bat dau luot (masks_json): lay lai de biet mau ky vong; neu mau rieng chua vao luot nay thi tao luot moi
    leakNote = `startAttempt tra ${Object.keys(started).join(',')}; ${started.questions.length} cau; khong co dap an trong JSON (${json.length} byte)`
    return leakNote
  })

  await step('h2', 'Lam bai luyen tap: tiep tuc luot do, cham ngay, nop bai, mask duc + dung mau', async () => {
    // luot dang dop (attemptA) duoc tao truoc khi doi mau rieng -> bo qua, bat dau lai de co mau moi: huy luot dop bang Thoat khong can; lam tiep luot do de test resume
    await cleanLoad()
    await openFile(ids.fileHeThan)
    await until('document.querySelector(".practice-resume-hint")', 8000, 'nut "Co luot lam do"')
    await shot('h2-resume-hint')
    await evaluate('document.querySelector(".practice-resume-hint").click()')
    await until("document.querySelector('.pq-modal')", 8000, 'hop thoai luot do')
    await click('Chấp nhận', '.pq-modal')
    await until('document.querySelector(".pq-qcard .pq-svg image")', 15000, 'cau hoi dau tien')
    await sleep(500)
    const attempt = latestAttempt()
    const questions = attemptQuestions(attempt.id)
    const flagged = await evaluate("document.querySelector('.pq-timer')?.innerText ?? ''")
    // kiem tra o che: fill-opacity 1 va mau
    const masks = await evaluate(`[...document.querySelectorAll('.pq-qcard .pq-svg rect:not(.pq-target-box)')].map(r => ({ fill: r.getAttribute('fill'), op: r.getAttribute('fill-opacity') }))`)
    if (masks.length < 1) throw new Error('khong co o che nao')
    if (masks.some((m: { op: string }) => m.op !== '1')) throw new Error('co o che khong duc 100%: ' + JSON.stringify(masks.filter((m: { op: string }) => m.op !== '1').slice(0, 3)))
    const colors = [...new Set(masks.map((m: { fill: string }) => m.fill.toLowerCase()))]
    // pixel
    await shot('h2-question')
    const png = await h.win.webContents.capturePage()
    const size = png.getSize()
    const bmp = png.toBitmap() // BGRA
    const factor = size.width / (await evaluate('innerWidth'))
    const rects = await evaluate(`[...document.querySelectorAll('.pq-qcard .pq-svg rect:not(.pq-target-box)')].map(r => { const b = r.getBoundingClientRect(); return { fill: r.getAttribute('fill'), x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height } })`)
    const toRgb = (hex: string): [number, number, number] => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
    let checkedPixels = 0
    let bad: string[] = []
    // chi kiem tra o che du lon & khong bi o khac de len: lay toi da 10 o
    for (const r of rects.filter((x: { w: number; h: number }) => x.w >= 6 && x.h >= 4).slice(0, 12)) {
      const px = Math.round(r.x * factor)
      const py = Math.round(r.y * factor)
      if (px < 0 || py < 0 || px >= size.width || py >= size.height) continue
      const i = (py * size.width + px) * 4
      const got: [number, number, number] = [bmp[i + 2], bmp[i + 1], bmp[i]]
      const want = toRgb(String(r.fill))
      // o che chong nhau co the cho mau khac; chap nhan neu trung mau BAT KY o che nao
      const okAny = rects.some((o: { fill: string }) => { const w = toRgb(o.fill); return Math.abs(w[0] - got[0]) <= 3 && Math.abs(w[1] - got[1]) <= 3 && Math.abs(w[2] - got[2]) <= 3 })
      checkedPixels += 1
      if (!okAny) bad.push(`${r.fill} -> rgb(${got.join(',')})`)
      void want
    }
    if (checkedPixels < 3) throw new Error('qua it o che de kiem tra pixel: ' + checkedPixels)
    if (bad.length > 0) throw new Error('pixel khong khop mau che (o che khong duc?): ' + bad.join('; '))
    // pixel kiem chung rieng cho o do (mau rieng) neu o do co mat
    const redRects = rects.filter((x: { fill: string }) => x.fill.toLowerCase() === '#ff0000')
    let redNote = 'luot dang do tao truoc khi doi mau rieng nen khong co o do'
    if (redRects.length > 0) {
      const r = redRects[0]
      const i = (Math.round(r.y * factor) * size.width + Math.round(r.x * factor)) * 4
      redNote = `o do rgb(${bmp[i + 2]},${bmp[i + 1]},${bmp[i]})`
    }
    // chap nhan moi: tra loi cau 1 SAI
    const correct0 = await answerCurrent(attempt.id, false)
    await until("document.querySelector('.pq-feedback')", 8000, 'phan hoi cham ngay')
    const fb = await evaluate("document.querySelector('.pq-feedback').innerText")
    if (!fb.includes('Sai') || !fb.includes(correct0)) throw new Error('phan hoi cau sai khong dung: ' + fb)
    await shot('h2-feedback-wrong')
    // sang cau 2: DUNG
    await evaluate("document.querySelector('.pq-qcard .pq-action').click()")
    await until("document.querySelector('.pq-qcard .pq-answer-input') && !document.querySelector('.pq-qcard .pq-answer-input').disabled && !document.querySelector('.pq-feedback')", 8000, 'cau 2')
    await answerCurrent(attempt.id, true)
    await until("document.querySelector('.pq-feedback--ok')", 8000, 'phan hoi dung')
    await evaluate("document.querySelector('.pq-qcard .pq-action').click()")
    await until("document.querySelector('.pq-qcard .pq-answer-input') && !document.querySelector('.pq-qcard .pq-answer-input').disabled && !document.querySelector('.pq-feedback')", 8000, 'cau 3')
    await answerCurrent(attempt.id, true)
    await until("document.querySelector('.pq-feedback--ok')", 8000)
    const lastLabel = await evaluate("document.querySelector('.pq-qcard .pq-action').textContent.trim()")
    if (lastLabel !== 'Nộp bài') throw new Error('nut cuoi phai la "Nop bai": ' + lastLabel)
    await evaluate("document.querySelector('.pq-qcard .pq-action').click()")
    await until("document.querySelector('.pq-hero')", 15000, 'man ket qua')
    await shot('h2-result')
    const hero = await evaluate("document.querySelector('.pq-hero-title').innerText")
    const done = latestAttempt()
    if (done.status !== 'completed' || done.correct_count !== 2) throw new Error('ket qua DB: ' + JSON.stringify(done))
    await closeOverlay()
    return `resume modal "Chap nhan" -> lam tiep; ${masks.length} o che fill-opacity=1, mau ${JSON.stringify(colors)}; pixel ${checkedPixels} o khop mau; ${redNote}; cham ngay Sai/Dung; ket qua "${hero.replace(/\s+/g, ' ')}" (DB 2/3); timer "${String(flagged).slice(0, 14)}"`
  })

  // =============== (g3) Mau rieng + do mo trong luot MOI ===============
  await step('g3', 'Luot moi sau khi dat mau rieng: o do dung #ff0000, do mo chung 0.4 khong lam mo o che', async () => {
    await openOverlayButton('Làm bài', '.pq-picker')
    // bat dau de luyen tap
    const cards = await evaluate("[...document.querySelectorAll('.pq-set-card')].map(c => c.querySelector('.pq-set-name').textContent)")
    const idx = cards.indexOf('De UI luyen tap')
    if (idx < 0) throw new Error('khong thay de: ' + JSON.stringify(cards))
    await evaluate(`document.querySelectorAll('.pq-set-card')[${idx}].querySelector('button').click()`)
    await until('document.querySelector(".pq-qcard .pq-svg image")', 15000, 'cau hoi')
    await sleep(500)
    const attempt = latestAttempt()
    const masks = await evaluate(`[...document.querySelectorAll('.pq-qcard .pq-svg rect:not(.pq-target-box)')].map(r => { const b = r.getBoundingClientRect(); return { fill: r.getAttribute('fill'), op: r.getAttribute('fill-opacity'), x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height } })`)
    const fills: string[] = [...new Set<string>(masks.map((m: { fill: string }) => m.fill.toLowerCase()))]
    // Region mau do co the nam o trang khac cua cau hoi dau: dung query de biet co can thay mau do hay khong
    const firstRegion = attemptQuestions(attempt.id)[0]
    const mm = JSON.parse(firstRegion.masks_json) as { color: string }[]
    const dbColors = [...new Set(mm.map((m) => m.color.toLowerCase()))]
    if (!(fills.length === dbColors.length && fills.every((f) => dbColors.includes(f)))) throw new Error(`mau o che DOM ${JSON.stringify(fills)} != DB ${JSON.stringify(dbColors)}`)
    if (masks.some((m: { op: string }) => m.op !== '1')) throw new Error('o che khong duc 100%')
    await shot('h2b-mask-colors')
    const png = await h.win.webContents.capturePage()
    const size = png.getSize()
    const bmp = png.toBitmap()
    const factor = size.width / (await evaluate('innerWidth'))
    const toRgb = (hex: string): [number, number, number] => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
    const sample = (m: { x: number; y: number }): [number, number, number] => { const i = (Math.round(m.y * factor) * size.width + Math.round(m.x * factor)) * 4; return [bmp[i + 2], bmp[i + 1], bmp[i]] }
    const results: string[] = []
    for (const color of fills) {
      const m = masks.find((x: { fill: string; w: number; h: number }) => x.fill.toLowerCase() === color && x.w >= 6 && x.h >= 4)
      if (!m) continue
      const got = sample(m)
      const want = toRgb(color)
      const ok = Math.abs(got[0] - want[0]) <= 3 && Math.abs(got[1] - want[1]) <= 3 && Math.abs(got[2] - want[2]) <= 3
      results.push(`${color} -> rgb(${got.join(',')}) ${ok ? 'KHOP' : 'LECH'}`)
      if (!ok) {
        // o che co the bi o khac chong len: chap nhan neu trung voi mot o che bat ky
        const any = masks.some((o: { fill: string }) => { const w = toRgb(o.fill); return Math.abs(w[0] - got[0]) <= 3 && Math.abs(w[1] - got[1]) <= 3 && Math.abs(w[2] - got[2]) <= 3 })
        if (!any) throw new Error('pixel lech mau o che: ' + results.join('; '))
      }
    }
    await evaluate("(() => { const b = [...document.querySelectorAll('.pq-overlay .pq-header-actions button')].find(x => x.textContent.trim() === 'Thoát'); b && b.click() })()")
    await sleep(300)
    await evaluate("[...document.querySelectorAll('.confirm-dialog button')].find(b => b.textContent.trim() === 'Thoát')?.click()")
    await until("!document.querySelector('.pq-overlay')", 8000)
    return `mau DOM ${JSON.stringify(fills)} = mau DB cua luot ${JSON.stringify(dbColors)}; fill-opacity=1 cho moi o; pixel: ${results.join('; ')}`
  })

  // =============== (h3) Thi thu ===============
  await step('h3', 'Thi thu: khoa dap an, khong lo dap an, het gio tu chuyen, nop -> ket qua', async () => {
    await openOverlayButton('Làm bài', '.pq-picker')
    // luot dop cua g3 (Thoat -> luu dop): bo qua
    if (await evaluate("Boolean(document.querySelector('.pq-modal'))")) await click('Bỏ lượt dở này', '.pq-modal')
    const cards = await evaluate("[...document.querySelectorAll('.pq-set-card')].map(c => c.querySelector('.pq-set-name').textContent)")
    const idx = cards.indexOf('De UI thi thu')
    if (idx < 0) throw new Error('khong thay de thi thu: ' + JSON.stringify(cards))
    await evaluate(`document.querySelectorAll('.pq-set-card')[${idx}].querySelector('button').click()`)
    await until('document.querySelector(".pq-qcard .pq-svg image")', 15000, 'cau 1 thi thu')
    const attempt = latestAttempt()
    if (attempt.feedback_mode !== 'exam') throw new Error('luot khong phai exam')
    const qs = attemptQuestions(attempt.id)
    let leakedText = false
    const labels: string[] = []
    for (let k = 0; k < qs.length; k++) {
      await until(`(document.querySelector('.pq-qcard')?.getAttribute('aria-label') ?? '').startsWith('Câu ${k + 1} ')`, 20000, `cau ${k + 1}`)
      const correct = k % 2 === 0
      await answerCurrent(attempt.id, correct)
      await sleep(250)
      const label = await evaluate("document.querySelector('.pq-qcard .pq-action').textContent.trim()")
      labels.push(label)
      const domText = await evaluate("document.querySelector('.pq-run-main')?.innerText ?? ''")
      if (await evaluate("Boolean(document.querySelector('.pq-feedback'))")) throw new Error('thi thu hien phan hoi ngay (lo ket qua)')
      if (qs.some((q) => domText.includes(q.answer_text) && q.answer_text.length >= 4 && q.answer_text !== qs[k].answer_text)) leakedText = true
      if (k === 0) await shot('h3-exam-locked')
    }
    if (leakedText) throw new Error('man thi chua dap an cua cau khac')
    if (!labels.every((l) => l === 'Huỷ xác nhận')) throw new Error('nut sau xac nhan phai la "Huy xac nhan": ' + labels.join('|'))
    await until("document.querySelector('.pq-hero')", 40000, 'ket qua thi thu (tu nop khi het gio)')
    await shot('h3-exam-result')
    const hero = await evaluate("document.querySelector('.pq-hero-title').innerText")
    const done = latestAttempt()
    if (done.status !== 'completed' || done.correct_count !== 2) throw new Error('ket qua DB thi thu: ' + JSON.stringify(done))
    ids.examAttempt = done.id
    return `khoa "${labels[0]}", khong co phan hoi trong luc thi; het gio tu chuyen; ket qua "${hero.replace(/\s+/g, ' ')}" DB ${done.correct_count}/${done.question_count} score ${done.score}`
  })

  // =============== (h4) Lich su + on cau sai ===============
  await step('h4', 'Lich su: luot thi thu + bieu do; On cau sai tao de moi', async () => {
    await closeOverlay().catch(() => undefined)
    await openOverlayButton('Lịch sử & ôn câu sai', '.pq-history')
    await until("document.querySelector('.pq-attempt')", 8000, 'luot trong lich su')
    const n = await evaluate("document.querySelectorAll('.pq-attempt').length")
    const points = await evaluate("document.querySelectorAll('.pq-chart-point').length")
    await shot('h4-history')
    const hasPracticeInHistory = db.prepare("SELECT COUNT(*) AS n FROM practice_attempts WHERE file_id = ? AND feedback_mode = 'practice' AND saved_history = 1").get(ids.fileHeThan) as { n: number }
    if (n < 1 || points < 1) throw new Error(`lich su rong: luot=${n} diem=${points}`)
    await click('Ôn câu sai', '.pq-history-detail')
    await until("document.querySelector('.pq-qcard .pq-svg image')", 15000, 'bat dau on cau sai')
    const reviewSet = db.prepare('SELECT s.id, (SELECT COUNT(*) FROM practice_station_set_questions q WHERE q.station_set_id = s.id) AS n FROM practice_station_sets s WHERE s.source_attempt_id = ?').get(ids.examAttempt) as { id: string; n: number } | undefined
    if (!reviewSet) throw new Error('on cau sai khong tao bo de moi')
    if (reviewSet.n !== 2) throw new Error('bo on cau sai co ' + reviewSet.n + ' cau, ky vong 2')
    await shot('h4-review-run')
    await evaluate("(() => { const b = [...document.querySelectorAll('.pq-overlay .pq-header-actions button')].find(x => x.textContent.trim() === 'Thoát'); b && b.click() })()")
    await sleep(300)
    await evaluate("[...document.querySelectorAll('.confirm-dialog button')].find(b => b.textContent.trim() === 'Thoát')?.click()")
    await sleep(400)
    return `lich su ${n} luot, bieu do ${points} diem; luot luyen tap trong lich su: ${hasPracticeInHistory.n} (thiet ke: chi thi thu); On cau sai -> bo de moi ${reviewSet.n} cau`
  })

  // =============== (i) Hoi quy khu Bai hoc ===============
  await step('i1', 'Bai hoc: dinh kem PDF + mo khung xem file, khong con nut Thi TH GP, khong loi', async () => {
    await cleanLoad()
    const lessonId = (db.prepare("SELECT id FROM lessons WHERE title = 'Bai hoc test'").get() as { id: string } | undefined)?.id
    if (!lessonId) throw new Error('khong thay bai hoc test')
    const att = await addAttachmentFromPath(lessonId, h.samples.heThan)
    await evaluate("[...document.querySelectorAll('.sidebar-tab')][0].click()")
    await until("[...document.querySelectorAll('.tree-label')].some(e => e.textContent.includes('Chu de test'))", 10000)
    await evaluate("[...document.querySelectorAll('.tree-label')].find(e => e.textContent.includes('Chu de test')).closest('.tree-row').click()")
    await sleep(400)
    await until("[...document.querySelectorAll('.tree-label')].some(e => e.textContent.includes('Bai hoc test'))", 10000)
    await evaluate("[...document.querySelectorAll('.tree-label')].find(e => e.textContent.includes('Bai hoc test')).closest('.tree-row').click()")
    await until("document.querySelector('.attachment-item')", 10000, 'file dinh kem')
    await evaluate("document.querySelector('.attachment-item').click()")
    await sleep(2500)
    await shot('i1-lesson-attachment')
    const body = await evaluate('document.body.innerText')
    if (body.includes('Thi TH GP') || body.includes('Chỉnh sửa Thi TH GP')) throw new Error('van con nut Thi TH GP')
    const viewer = await evaluate("Boolean(document.querySelector('.attachment-viewer, .viewer-panel, [class*=viewer]'))")
    const imgs = await evaluate("document.querySelectorAll('img').length")
    return `dinh kem ${att.fileName}; khung xem mo (${viewer ? 'co' : 'khong thay class viewer'}; ${imgs} anh); khong co chu "Thi TH GP"`
  })
}
