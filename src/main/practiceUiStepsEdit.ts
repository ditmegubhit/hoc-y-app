import type { ScenarioContext, StepFn } from './practiceUiScenario'
import type { Shared } from './practiceUiSteps'

// Muc (f): man "Sua dap an" - bo cuc, "?", trinh tu, chon vung. Muc (g): mau + do mo.

interface RegionRow {
  id: string
  page_number: number
  status: string
  reviewed: number
  suspect: number
  answer_text: string | null
  label_box_json: string
  ref_width: number
  ref_height: number
  crop_box_json: string | null
  color_override: string | null
  opacity_override: number | null
  manual: number
}

export async function runEditSteps(step: StepFn, ctx: ScenarioContext, shared: Shared): Promise<void> {
  const { db, click, h } = ctx
  const { evaluate, until, sleep, shot } = h
  const { ids, openFile } = shared

  const region = (id: string): RegionRow => db.prepare('SELECT * FROM practice_regions WHERE id = ?').get(id) as RegionRow
  const regionsOf = (fileId: string, page?: number): RegionRow[] =>
    (page === undefined
      ? db.prepare('SELECT * FROM practice_regions WHERE file_id = ? ORDER BY page_number, id').all(fileId)
      : db.prepare('SELECT * FROM practice_regions WHERE file_id = ? AND page_number = ? ORDER BY id').all(fileId, page)) as RegionRow[]

  // ----- Nhap lieu -----
  let mouseWorks: boolean | null = null
  const sendMouse = (type: 'mouseDown' | 'mouseUp' | 'mouseMove', x: number, y: number): void => {
    h.win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 } as never)
  }
  const drag = async (x0: number, y0: number, x1: number, y1: number, steps = 6): Promise<void> => {
    sendMouse('mouseMove', x0, y0)
    await sleep(40)
    sendMouse('mouseDown', x0, y0)
    await sleep(40)
    for (let i = 1; i <= steps; i += 1) {
      sendMouse('mouseMove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps)
      await sleep(25)
    }
    sendMouse('mouseUp', x1, y1)
    await sleep(250)
  }
  const clickAt = async (x: number, y: number): Promise<void> => {
    sendMouse('mouseMove', x, y)
    await sleep(40)
    sendMouse('mouseDown', x, y)
    await sleep(40)
    sendMouse('mouseUp', x, y)
    await sleep(250)
  }
  // Phim: phat KeyboardEvent vao phan tu dang focus (cua so an khong nhan phim that).
  const press = async (key: string, opts: { ctrl?: boolean; alt?: boolean } = {}): Promise<void> => {
    await evaluate(`(() => { const t = document.activeElement || document.body; t.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, ctrlKey: ${Boolean(opts.ctrl)}, altKey: ${Boolean(opts.alt)}, bubbles: true, cancelable: true })) })()`)
    await sleep(350)
  }
  const typeAnswer = async (value: string): Promise<void> => {
    await evaluate(`(() => { const i = document.querySelector('.pe-root [data-pe-answer]'); i.focus(); window.__h.setValue(i, ${JSON.stringify(value)}) })()`)
    await sleep(120)
  }
  const blurAll = (): Promise<void> => evaluate('document.activeElement && document.activeElement.blur && document.activeElement.blur()')
  const imgRect = (): Promise<{ left: number; top: number; width: number; height: number }> =>
    evaluate("(() => { const r = document.querySelector('.pe-root .practice-viewer-img').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } })()")
  const regionCenter = async (row: RegionRow): Promise<{ x: number; y: number; w: number; h: number }> => {
    const im = await imgRect()
    const box = JSON.parse(row.label_box_json) as { x0: number; y0: number; x1: number; y1: number }
    const sx = im.width / row.ref_width
    const sy = im.height / row.ref_height
    return { x: im.left + ((box.x0 + box.x1) / 2) * sx, y: im.top + ((box.y0 + box.y1) / 2) * sy, w: (box.x1 - box.x0) * sx, h: (box.y1 - box.y0) * sy }
  }
  const text = (selector: string): Promise<string> => evaluate(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`)
  const summary = (): Promise<string> => text('.pe-root .pe-summary')
  const position = (): Promise<string> => text('.pe-root .pe-position')
  const openEditor = async (fileId: string): Promise<void> => {
    await openFile(fileId)
    await until("window.__h.btn('Sửa đáp án', '.practice-action-bar')", 8000)
    await click('Sửa đáp án', '.practice-action-bar')
    await until("document.querySelector('.pe-root .practice-viewer-img')", 15000, 'overlay sua dap an co anh')
    await sleep(500)
  }
  const closeEditor = async (): Promise<void> => {
    await evaluate("window.__h.btn('Thoát', '.pe-root')?.click()")
    await sleep(300)
    if (await evaluate("Boolean(document.querySelector('.confirm-dialog'))")) await click('Thoát, không lưu', '.confirm-dialog')
    await until("!document.querySelector('.pe-root')", 5000, 'dong overlay')
  }
  const setMode = async (mode: 'sequence' | 'select'): Promise<void> => {
    await click(mode === 'sequence' ? 'Sửa trình tự' : 'Sửa chọn vùng', '.pe-seg')
    await sleep(500)
  }

  // =============== (f1) Mo overlay + bo cuc 1/4 - 3/4 + thanh chia ===============
  await step('f1', 'Sua dap an: overlay trong khung phai, bo cuc 1/4-3/4, thanh chia keo duoc', async () => {
    await openEditor(ids.fileHeThan)
    await shot('f1-overlay-open')
    const geo = await evaluate(`(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom } }
      return { root: r('.pe-root'), dialog: r('.pe-dialog'), viewer: r('.pe-viewer-pane'), split: r('.pe-splitter'), sidebar: r('.app-sidebar'), docScroll: document.documentElement.scrollHeight - innerHeight, innerH: innerHeight }
    })()`)
    if (!geo.sidebar || geo.sidebar.w < 100) throw new Error('sidebar khong thay khi mo overlay')
    if (geo.root.l < geo.sidebar.r - 1) throw new Error(`overlay de len sidebar: root.left=${geo.root.l} sidebar.right=${geo.sidebar.r}`)
    const total = geo.dialog.h + geo.split.h + geo.viewer.h
    const ratio = geo.dialog.h / total
    if (Math.abs(ratio - 0.25) > 0.04) throw new Error(`ti le hop thoai ${ratio.toFixed(3)} != 0.25`)
    if (geo.docScroll > 1) throw new Error('trang bi cuon: ' + geo.docScroll)
    // keo thanh chia xuong ~0.4
    const sx = geo.split.l + geo.split.w / 2
    const sy = geo.split.t + geo.split.h / 2
    const targetY = geo.root.t + geo.root.h * 0.4
    await drag(sx, sy, sx, targetY)
    let ratio2 = await evaluate("(() => { const d = document.querySelector('.pe-dialog').getBoundingClientRect(); const v = document.querySelector('.pe-viewer-pane').getBoundingClientRect(); const s = document.querySelector('.pe-splitter').getBoundingClientRect(); return d.height / (d.height + v.height + s.height) })()")
    let how = 'chuot that (sendInputEvent)'
    if (Math.abs(ratio2 - 0.4) > 0.05) {
      // du phong: phim mui ten tren thanh chia
      how = 'phim mui ten (chuot that khong vao cua so an)'
      await evaluate("document.querySelector('.pe-splitter').focus()")
      for (let i = 0; i < 8; i += 1) await press('ArrowDown')
      ratio2 = await evaluate("(() => { const d = document.querySelector('.pe-dialog').getBoundingClientRect(); const v = document.querySelector('.pe-viewer-pane').getBoundingClientRect(); const s = document.querySelector('.pe-splitter').getBoundingClientRect(); return d.height / (d.height + v.height + s.height) })()")
    }
    if (ratio2 < 0.3) throw new Error(`keo thanh chia khong doi ti le: ${ratio2}`)
    const saved = await evaluate("localStorage.getItem('practice.edit.split')")
    await shot('f1-split-dragged')
    // bam doi -> ve 1/4
    await evaluate("document.querySelector('.pe-splitter').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))")
    await sleep(300)
    const ratio3 = await evaluate("(() => { const d = document.querySelector('.pe-dialog').getBoundingClientRect(); const v = document.querySelector('.pe-viewer-pane').getBoundingClientRect(); const s = document.querySelector('.pe-splitter').getBoundingClientRect(); return d.height / (d.height + v.height + s.height) })()")
    if (Math.abs(ratio3 - 0.25) > 0.03) throw new Error(`bam doi khong ve 1/4: ${ratio3}`)
    mouseWorks = how.startsWith('chuot')
    return `overlay left=${Math.round(geo.root.l)} >= sidebar.right=${Math.round(geo.sidebar.r)}; ti le ${ratio.toFixed(3)} -> keo (${how}) ${ratio2.toFixed(3)} (luu "${saved}") -> bam doi ${ratio3.toFixed(3)}`
  })

  // =============== (f2) Nut "?" ===============
  await step('f2', 'Nut "?" hien huong dan phim tat sau ~1 giay va an khi re ra', async () => {
    const r = await evaluate("(() => { const b = document.querySelector('.pe-help-btn').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })()")
    sendMouse('mouseMove', 5, 5)
    await sleep(200)
    sendMouse('mouseMove', r.x, r.y)
    await sleep(400)
    let early = await evaluate("Boolean(document.querySelector('.pe-help-pop'))")
    let how = 'chuot that'
    if (!(await evaluate("document.querySelector('.pe-help-btn:hover') !== null"))) {
      how = 'PointerEvent gia lap (chuot that khong vao cua so an)'
      await evaluate("document.querySelector('.pe-help-btn').dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerId: 1, relatedTarget: document.body }))")
      await sleep(300)
      early = await evaluate("Boolean(document.querySelector('.pe-help-pop'))")
    }
    if (early) throw new Error('hop huong dan hien QUA SOM (<1s)')
    await sleep(900)
    const shown = await evaluate("Boolean(document.querySelector('.pe-help-pop'))")
    if (!shown) throw new Error('sau ~1.3s hop huong dan chua hien')
    const popText = await text('.pe-help-pop')
    await shot('f2-help-shown')
    if (how.startsWith('chuot')) sendMouse('mouseMove', 5, 400)
    else await evaluate("document.querySelector('.pe-help-btn').dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerId: 1, relatedTarget: document.body }))")
    await sleep(300)
    const hidden = !(await evaluate("Boolean(document.querySelector('.pe-help-pop'))"))
    if (!hidden) throw new Error('re ra ma hop huong dan van con')
    for (const k of ['Enter', 'Esc', 'Delete', 'Ctrl + Z']) if (!popText.includes(k)) throw new Error('thieu phim ' + k)
    return `an luc 0.4s, hien luc ~1.3s (${how}), an khi re ra; noi dung co Enter/Esc/Delete/Ctrl+Z`
  })

  // =============== (f3) Sua trinh tu ===============
  await step('f3', 'Sua trinh tu: trang bat dau, cong tac tat ca, Enter luu + sang vung ke', async () => {
    await setMode('sequence')
    await shot('f3-sequence-initial')
    const pos0 = await position()
    const total0 = Number(/\/ (\d+)/.exec(pos0)?.[1] ?? 0)
    const unrev = db.prepare("SELECT COUNT(*) AS n FROM practice_regions WHERE file_id = ? AND reviewed = 0").get(ids.fileHeThan) as { n: number }
    if (total0 !== unrev.n) throw new Error(`hang doi ${total0} != so vung chua duyet ${unrev.n} (${pos0})`)
    // Trang bat dau = 2
    await evaluate("(() => { const s = document.querySelector('.pe-scope select'); s.value = '2'; s.dispatchEvent(new Event('change', { bubbles: true })) })()")
    await sleep(500)
    const pos2 = await position()
    const total2 = Number(/\/ (\d+)/.exec(pos2)?.[1] ?? 0)
    const unrev2 = db.prepare("SELECT COUNT(*) AS n FROM practice_regions WHERE file_id = ? AND reviewed = 0 AND page_number >= 2").get(ids.fileHeThan) as { n: number }
    if (total2 !== unrev2.n) throw new Error(`trang bat dau 2: hang doi ${total2} != ${unrev2.n}`)
    const sum2 = await summary()
    if (!sum2.includes('trang 2/')) throw new Error('chua nhay sang trang 2: ' + sum2)
    // Cong tac "Tat ca vung"
    await click('Tất cả vùng', '.pe-scope')
    await sleep(500)
    const posAll = await position()
    const totalAll = Number(/\/ (\d+)/.exec(posAll)?.[1] ?? 0)
    const allP2 = db.prepare('SELECT COUNT(*) AS n FROM practice_regions WHERE file_id = ? AND page_number >= 2').get(ids.fileHeThan) as { n: number }
    if (totalAll !== allP2.n) throw new Error(`cong tac tat ca: ${totalAll} != ${allP2.n}`)
    await click('Tất cả vùng', '.pe-scope')
    await sleep(400)
    // Quay ve trang 1, chuan bi: danh dau da duyet moi vung trang 1 tru vung cuoi hang doi
    await evaluate("(() => { const s = document.querySelector('.pe-scope select'); s.value = '1'; s.dispatchEvent(new Event('change', { bubbles: true })) })()")
    await sleep(500)
    // Vung dau hang doi: o dap an tu focus
    const focusedAnswer = await evaluate("document.activeElement?.hasAttribute('data-pe-answer')")
    if (!focusedAnswer) throw new Error('o dap an KHONG tu focus khi vao vung')
    const firstAnswerBefore = await evaluate("document.querySelector('.pe-root [data-pe-answer]').value")
    const idsQueue = db.prepare('SELECT id, page_number FROM practice_regions WHERE file_id = ? AND reviewed = 0 ORDER BY page_number, id').all(ids.fileHeThan) as { id: string; page_number: number }[]
    // Enter xac nhan vung hien hanh (gõ dap an moi)
    const stamp = 'test dap an ' + Date.now() % 1000
    await typeAnswer(stamp)
    await press('Enter')
    // Tim vung vua luu theo answer_text
    const saved = db.prepare('SELECT * FROM practice_regions WHERE file_id = ? AND answer_text = ?').get(ids.fileHeThan, stamp) as RegionRow | undefined
    if (!saved) throw new Error('Enter khong luu dap an vao DB')
    if (saved.status !== 'confirmed' || saved.reviewed !== 1) throw new Error(`DB sau Enter: status=${saved.status} reviewed=${saved.reviewed}`)
    const pos1 = await position()
    if (!/^Vùng 1 \//.test(pos1) && !pos1.startsWith('Vùng')) throw new Error('vi tri: ' + pos1)
    const total1 = Number(/\/ (\d+)/.exec(pos1)?.[1] ?? 0)
    if (total1 !== total0 || !pos1.startsWith('Vùng 2 /')) throw new Error(`sau Enter phai sang Vung 2/${total0}, thuc te: ${pos1}`)
    const answerAfter = await evaluate("document.querySelector('.pe-root [data-pe-answer]').value")
    ids.firstSavedRegion = saved.id
    await shot('f3-after-enter')
    const heights = await evaluate("(() => { const hh = (s) => Math.round(document.querySelector(s)?.getBoundingClientRect().height ?? -1); return { viewportH: innerHeight, dialog: hh('.pe-dialog'), head: hh('.pe-head'), answerCard: hh('.pe-answer-card'), colorCard: hh('.pe-color-card'), regionCard: hh('.pe-region-card'), body: hh('.pe-dialog-body'), bodyScroll: document.querySelector('.pe-dialog-body').scrollHeight }; })()")
    h.log('   [do cao hop thoai] ' + JSON.stringify(heights))
    return `hang doi ${total0} (=chua duyet) -> tu trang 2: ${total2}; cong tac tat ca: ${totalAll}; o dap an tu focus; Enter luu "${stamp}" confirmed+reviewed, tu sang vung ke ("${firstAnswerBefore}" -> "${answerAfter}", ${pos1}); queue dau=${idsQueue[0]?.page_number}`
  })

  await step('f4', 'Sua trinh tu: <-/->, Delete, Ctrl+Z, Chi che, sang trang ke', async () => {
    await blurAll()
    const pos0 = await position()
    await press('ArrowRight')
    const posR = await position()
    await blurAll() // o dap an tu focus lai khi doi vung; mui ten tron chi hoat dong ngoai o nhap (trong o nhap: Alt + mui ten)
    await press('ArrowLeft')
    const posL = await position()
    if (posR === pos0 || posL !== pos0) throw new Error(`mui ten: ${pos0} -> ${posR} -> ${posL}`)
    const n0 = (db.prepare('SELECT COUNT(*) AS n FROM practice_regions WHERE file_id = ?').get(ids.fileHeThan) as { n: number }).n
    // Delete -> xoa vung hien hanh
    const activeAnswer = await evaluate("document.querySelector('.pe-root [data-pe-answer]').value")
    await blurAll()
    await press('Delete')
    const n1 = (db.prepare('SELECT COUNT(*) AS n FROM practice_regions WHERE file_id = ?').get(ids.fileHeThan) as { n: number }).n
    if (n1 !== n0 - 1) throw new Error(`Delete khong xoa vung: ${n0} -> ${n1}`)
    // Ctrl+Z -> khoi phuc
    await blurAll()
    await press('z', { ctrl: true })
    const n2 = (db.prepare('SELECT COUNT(*) AS n FROM practice_regions WHERE file_id = ?').get(ids.fileHeThan) as { n: number }).n
    if (n2 !== n0) throw new Error(`Ctrl+Z khong khoi phuc vung: ${n1} -> ${n2}`)
    const toast = await text('.pe-toast')
    // "Chi che"
    const before = db.prepare("SELECT COUNT(*) AS n FROM practice_regions WHERE file_id = ? AND status = 'rejected'").get(ids.fileHeThan) as { n: number }
    await click('Chỉ che (không hỏi)', '.pe-root')
    await sleep(400)
    const after = db.prepare("SELECT COUNT(*) AS n FROM practice_regions WHERE file_id = ? AND status = 'rejected' AND reviewed = 1").get(ids.fileHeThan) as { n: number }
    if (after.n !== before.n + 1) throw new Error(`Chi che khong luu rejected+reviewed: ${before.n} -> ${after.n}`)
    // Duyet nhanh het vung trang 1 de kiem tra tu sang trang ke
    let guard = 0
    while (guard++ < 40) {
      const sum = await summary()
      if (!sum.includes('trang 1/')) break
      const hasAnswer = await evaluate("document.querySelector('.pe-root [data-pe-answer]')?.value?.trim().length > 0")
      if (!hasAnswer) await typeAnswer('x')
      await press('Enter')
    }
    const sumNext = await summary()
    if (!sumNext.includes('trang 2/')) throw new Error('khong tu sang trang ke sau khi het vung trang 1: ' + sumNext)
    await shot('f4-crossed-to-page2')
    return `<-/->: "${pos0}" -> "${posR}" -> "${posL}"; Delete xoa (${n0}->${n1}) roi Ctrl+Z khoi phuc (${n2}), thong bao "${toast.slice(0, 40)}"; Chi che luu rejected+reviewed; het trang 1 tu sang trang 2 (${sumNext})`
  })

  await step('f5', 'Sua trinh tu: vung nghi rac co nen doi nghich + chu giai', async () => {
    // Tim vung nghi rac chua duyet, di den do bang cach dung che do chon vung o trang 1
    await closeEditor()
    await openEditor(ids.fileHeThan)
    await setMode('select')
    await until("document.querySelector('.pe-root .pe-canvas')", 8000)
    for (let i = 0; i < 5 && !(await summary()).includes('Trang 1/'); i += 1) {
      await blurAll()
      await press('ArrowLeft')
    }
    if (!(await summary()).includes('Trang 1/')) throw new Error('khong ve duoc trang 1: ' + (await summary()))
    const info = await evaluate(`(() => {
      const rects = [...document.querySelectorAll('.pe-root .pe-canvas rect.pe-region')]
      const sus = rects.filter(r => r.classList.contains('is-suspect'))
      const norm = rects.filter(r => !r.classList.contains('is-suspect'))
      const fill = (r) => r.style.fill
      return { total: rects.length, suspect: sus.length, suspectFills: [...new Set(sus.map(fill))], normalFills: [...new Set(norm.map(fill))], labels: [...document.querySelectorAll('.pe-root .pe-suspect-text')].map(t => t.textContent), legend: document.querySelector('.pe-legend')?.innerText }
    })()`)
    await shot('f5-suspect-page1')
    if (info.suspect < 1) throw new Error('khong thay vung nghi rac tren trang 1: ' + JSON.stringify(info))
    if (info.suspectFills.some((f: string) => info.normalFills.includes(f))) throw new Error('nen nghi rac trung mau che: ' + JSON.stringify(info))
    if (!info.legend.includes('nghi rác')) throw new Error('thieu chu giai')
    if (info.labels.length < 1) throw new Error('khong co nhan ly do')
    return `${info.suspect}/${info.total} vung nghi rac, nen ${JSON.stringify(info.suspectFills)} khac nen che ${JSON.stringify(info.normalFills)}; nhan ly do: ${info.labels.slice(0, 3).join(' | ')}; co chu giai`
  })

  // =============== (f6) Sua chon vung ===============
  await step('f6', 'Sua chon vung: click chon, keo di chuyen, doi co, xac nhan thi bo chon, <-/-> doi trang', async () => {
    // dang o che do select (f5), trang 1
    const target = (db.prepare("SELECT * FROM practice_regions WHERE file_id = ? AND page_number = 1 AND suspect = 0 AND status = 'confirmed' ORDER BY id LIMIT 1").get(ids.fileHeThan) as RegionRow)
    ids.selectRegion = target.id
    const c = await regionCenter(target)
    await clickAt(c.x, c.y)
    let selected = await evaluate("document.querySelector('.pe-root .pe-answer-card [data-pe-answer]')?.value ?? null")
    let how = 'chuot that'
    if (selected === null) {
      how = 'PointerEvent gia lap'
      // sendInputEvent khong vao: phat pointerdown+up tai phan tu o che
      throw new Error('click chon vung khong co tac dung (chuot that khong vao cua so an)')
    }
    if (selected !== (target.answer_text ?? '')) throw new Error(`chon sai vung: "${selected}" vs "${target.answer_text}"`)
    await shot('f6-selected')
    // keo di chuyen 25px sang phai/duoi
    const before = JSON.parse(target.label_box_json)
    await drag(c.x, c.y, c.x + 25, c.y + 20)
    const moved = JSON.parse(region(target.id).label_box_json)
    if (Math.abs(moved.x0 - before.x0) < 5) throw new Error('keo khong di chuyen vung: ' + JSON.stringify([before, moved]))
    // doi co: keo tay cam se (goc duoi phai)
    const hrect = await evaluate("(() => { const hs = [...document.querySelectorAll('.pe-root .pe-handle')]; const se = hs[hs.length > 4 ? 3 : 0]; const all = hs.map(h => { const b = h.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } }); return all })()")
    if (!hrect || hrect.length < 4) throw new Error('khong thay tay cam doi co: ' + (hrect?.length ?? 0))
    // chon tay cam goc co x, y lon nhat
    const se = hrect.reduce((a: any, b: any) => (b.x + b.y > a.x + a.y ? b : a))
    await drag(se.x, se.y, se.x + 18, se.y + 10)
    const resized = JSON.parse(region(target.id).label_box_json)
    if (!(resized.x1 - resized.x0 > moved.x1 - moved.x0 + 3)) throw new Error('doi co khong tang rong: ' + JSON.stringify([moved, resized]))
    // sua dap an + Enter -> bo chon
    await typeAnswer('chon vung ok')
    await press('Enter')
    const db1 = region(target.id)
    if (db1.answer_text !== 'chon vung ok' || db1.reviewed !== 1) throw new Error('Enter khong luu o che do chon vung')
    const stillSelected = await evaluate("document.querySelector('.pe-root .pe-answer-card [data-pe-answer]') !== null")
    if (stillSelected) throw new Error('xac nhan xong van con chon vung')
    // <-/-> doi trang
    await blurAll()
    await press('ArrowRight')
    const s1 = await summary()
    await press('ArrowLeft')
    const s2 = await summary()
    if (!s1.includes('Trang 2/') || !s2.includes('Trang 1/')) throw new Error(`mui ten doi trang: ${s1} / ${s2}`)
    return `${how}: chon vung "${selected}"; keo x0 ${Math.round(before.x0)}->${Math.round(moved.x0)}; doi co rong ${Math.round(moved.x1 - moved.x0)}->${Math.round(resized.x1 - resized.x0)}; Enter luu + bo chon; <-/-> doi trang (${s1.slice(0, 12)} / ${s2.slice(0, 12)})`
  })

  await step('f7', 'Sua chon vung: ve vung moi, ve crop, xem thu cau hoi', async () => {
    const n0 = regionsOf(ids.fileHeThan, 1).length
    // ve vung moi o goc trang (it co chu)
    await click('Vẽ vùng mới', '.pe-root')
    const im = await imgRect()
    await drag(im.left + im.width * 0.62, im.top + im.height * 0.90, im.left + im.width * 0.80, im.top + im.height * 0.95)
    const rows = regionsOf(ids.fileHeThan, 1)
    if (rows.length !== n0 + 1) throw new Error(`ve vung moi: ${n0} -> ${rows.length}`)
    const created = rows.find((r) => r.manual === 1)
    if (!created) throw new Error('vung moi khong danh dau manual')
    const selected = await evaluate("document.querySelector('.pe-root .pe-answer-card [data-pe-answer]') !== null")
    if (!selected) throw new Error('vung vua ve khong duoc tu chon')
    // ve crop cho vung vua tao
    await click('Vẽ vùng crop', '.pe-root')
    await drag(im.left + im.width * 0.2, im.top + im.height * 0.2, im.left + im.width * 0.8, im.top + im.height * 0.9)
    const cropped = region(created.id)
    if (!cropped.crop_box_json) throw new Error('ve crop khong luu')
    // xem thu
    await click('Xem thử câu hỏi', '.pe-root')
    await until("document.querySelector('.pe-preview svg image')", 8000, 'xem thu cau hoi')
    await sleep(500)
    await shot('f7-preview')
    const previewRects = await evaluate("document.querySelectorAll('.pe-preview svg rect:not(.pe-target-box)').length")
    await click('Đóng', '.pe-preview')
    await sleep(200)
    // xoa vung vua ve de du lieu sach (Delete tren vung dang chon)
    await blurAll()
    await press('Delete')
    const n1 = regionsOf(ids.fileHeThan, 1).length
    if (n1 !== n0) throw new Error(`xoa vung moi: ${n1} != ${n0}`)
    return `ve vung moi (manual) tu chon; crop luu ${cropped.crop_box_json?.slice(0, 40)}; xem thu co ${previewRects} o che; xoa lai OK`
  })

  // =============== (g) Mau + do mo ===============
  const fileRow = (): { mask_color: string; mask_opacity: number } =>
    db.prepare('SELECT mask_color, mask_opacity FROM practice_files WHERE node_id = ?').get(ids.fileHeThan) as { mask_color: string; mask_opacity: number }
  const setHex = async (scope: string, hex: string): Promise<void> => {
    await evaluate(`(() => { const i = document.querySelector(${JSON.stringify(scope + ' input[aria-label="Mã màu hex"]')}); i.focus(); window.__h.setValue(i, ${JSON.stringify(hex)}) })()`)
    await sleep(100)
    await evaluate(`window.__h.key(document.querySelector(${JSON.stringify(scope + ' input[aria-label="Mã màu hex"]')}), 'Enter')`)
    await sleep(500)
  }
  const svgFills = (): Promise<{ id: number; fill: string; opacity: string; cls: string }[]> =>
    evaluate("[...document.querySelectorAll('.pe-root .pe-canvas rect.pe-region')].map((r, i) => ({ id: i, fill: r.style.fill, opacity: r.style.fillOpacity, cls: r.getAttribute('class') }))")

  await step('g1', 'Mau che ca file: banh xe tron, doi mau chung, vung co mau rieng giu nguyen, do mo, dat lai', async () => {
    // dang o che do chon vung, trang 1
    const wheel = await evaluate("Boolean(document.querySelector('.pe-color-card canvas.pe-wheel-canvas'))")
    if (!wheel) throw new Error('khong co banh xe mau (canvas)')
    const wheelRound = await evaluate("(() => { const c = document.querySelector('.pe-color-card canvas.pe-wheel-canvas'); const b = c.getBoundingClientRect(); const px = c.getContext('2d').getImageData(1, 1, 1, 1).data[3]; const mid = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data[3]; return { w: b.width, h: b.height, cornerAlpha: px, centerAlpha: mid } })()")
    if (wheelRound.cornerAlpha !== 0 || wheelRound.centerAlpha === 0) throw new Error('banh xe khong tron: ' + JSON.stringify(wheelRound))
    await shot('g1-color-card')
    const base = fileRow()
    // chon 1 vung va dat mau rieng
    const target = db.prepare("SELECT * FROM practice_regions WHERE file_id = ? AND page_number = 1 AND suspect = 0 AND status = 'confirmed' ORDER BY id LIMIT 1").get(ids.fileHeThan) as RegionRow
    const c = await regionCenter(target)
    await clickAt(c.x, c.y)
    await evaluate("document.querySelector('.pe-region-card .pe-color-btn').click()")
    await until("document.querySelector('.pe-popover input[aria-label=\"Mã màu hex\"]')", 5000, 'popover mau rieng')
    await setHex('.pe-popover', '#ff0000')
    const own = region(target.id)
    if (own.color_override !== '#ff0000') throw new Error('mau rieng khong luu: ' + own.color_override)
    await evaluate("document.querySelector('.pe-region-card .pe-color-btn').click()")
    // doi mau chung
    await setHex('.pe-color-card', '#1e90ff')
    const f1 = fileRow()
    if (f1.mask_color.toLowerCase() !== '#1e90ff') throw new Error('mau chung khong luu: ' + f1.mask_color)
    const fills = await svgFills()
    const colors = [...new Set(fills.map((f) => f.fill))]
    const hasRed = fills.some((f) => f.fill === 'rgb(255, 0, 0)' && !f.cls.includes('is-suspect'))
    const hasBlue = fills.some((f) => f.fill === 'rgb(30, 144, 255)' && !f.cls.includes('is-suspect'))
    if (!hasRed) throw new Error('vung co mau rieng KHONG giu do: ' + JSON.stringify(colors))
    if (!hasBlue) throw new Error('vung khong co mau rieng KHONG doi sang xanh: ' + JSON.stringify(colors))
    await shot('g1-colors-changed')
    // do mo chung
    await evaluate("(() => { const r = document.querySelector('#pe-file-opacity'); window.__h.setValue(r, '40'); r.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })) })()")
    await sleep(500)
    const f2 = fileRow()
    if (Math.abs(f2.mask_opacity - 0.4) > 0.011) throw new Error('do mo chung khong luu: ' + f2.mask_opacity)
    const fills2 = await svgFills()
    const normalOpacity = fills2.find((f) => f.fill === 'rgb(30, 144, 255)')?.opacity
    if (!normalOpacity || Math.abs(Number(normalOpacity) - 0.4) > 0.02) throw new Error('canvas khong ap do mo chung: ' + normalOpacity)
    // do mo rieng cua vung dang chon
    await evaluate("(() => { const r = document.querySelector('#pe-region-opacity'); window.__h.setValue(r, '85'); r.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })) })()")
    await sleep(500)
    const own2 = region(target.id)
    if (own2.opacity_override === null || Math.abs(own2.opacity_override - 0.85) > 0.011) throw new Error('do mo rieng khong luu: ' + own2.opacity_override)
    await shot('g1-opacity')
    ids.colorRegion = target.id
    // dat lai mau rieng
    await evaluate("window.__h.btnContains('Đặt lại màu riêng', '.pe-color-card').click()")
    await until("document.querySelector('.confirm-dialog')", 5000, 'hop xac nhan dat lai')
    await click('Đặt lại', '.confirm-dialog')
    await sleep(600)
    const own3 = region(target.id)
    if (own3.color_override !== null || own3.opacity_override !== null) throw new Error('Dat lai khong xoa mau/do mo rieng: ' + JSON.stringify([own3.color_override, own3.opacity_override]))
    // dat lai mot mau rieng de buoc Tao bai thi kiem tra mau rieng luc lam bai
    return `banh xe tron (canvas, goc trong suot); mau chung ${base.mask_color} -> #1e90ff, vung co mau rieng giu #ff0000, vung khac doi xanh; do mo chung 0.4 ap len canvas; do mo rieng 0.85 luu; Dat lai xoa ca hai`
  })
}
