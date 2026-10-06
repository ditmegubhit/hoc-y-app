import { addPracticeFilesFromPaths } from './services/practice/addFiles'
import type { ScenarioContext, StepFn } from './practiceUiScenario'
import { diagnoseRecognizer, runScanSteps } from './practiceUiStepsScan'
import { runEditSteps } from './practiceUiStepsEdit'
import { runExamSteps } from './practiceUiStepsExam'

export interface Shared {
  ids: Record<string, string>
  openFile: (fileId: string) => Promise<void>
  pointer: (type: string, x: number, y: number, target?: string) => Promise<void>
}

// Cac muc (b)-(j) cua harness practice:smoke. Dung chung ngu canh voi practiceUiScenario.ts.

export async function runSteps(step: StepFn, ctx: ScenarioContext): Promise<void> {
  const { db, api, click, cleanLoad, h } = ctx
  const { evaluate, until, sleep, shot } = h
  const ids: Record<string, string> = {}
  // Chay tiep (--keep): khoi phuc id tu DB.
  const byName = (name: string): string | undefined => (db.prepare('SELECT id FROM practice_nodes WHERE name = ?').get(name) as { id: string } | undefined)?.id
  ids.folderA = byName('Giai phau 1') ?? ''
  ids.folderB = byName('Giai phau 2') ?? ''
  ids.fileHeThan = byName('Tiet nieu mau') ?? byName('He-than-p1-13-46') ?? ''
  ids.fileM11 = byName('M11-p3-40') ?? ''

  // Gia lap keo con tro (PointerEvent) tren phan tu / window.
  const pointer = (type: string, x: number, y: number, target = 'window'): Promise<void> =>
    evaluate(`(() => { const t = ${target}; t.dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { clientX: ${x}, clientY: ${y}, bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0 })) })()`)

  // Mo file thuc hanh tu cay (mo thu muc cha neu can) -> man file.
  const openFile = async (fileId: string): Promise<void> => {
    await evaluate("[...document.querySelectorAll('.sidebar-tab')].find(b => b.textContent.includes('Thực hành')).click()")
    await until("document.querySelectorAll('[data-practice-row]').length >= 1", 8000, 'cay co dong')
    const sel = `[data-node-id="${fileId}"]`
    if (!(await evaluate(`Boolean(document.querySelector('${sel}'))`))) {
      const parent = db.prepare('SELECT parent_id FROM practice_nodes WHERE id = ?').get(fileId) as { parent_id: string | null }
      if (parent.parent_id) await evaluate(`document.querySelector('[data-node-id="${parent.parent_id}"]').click()`)
    }
    await until(`document.querySelector('${sel}')`, 8000, 'dong file trong cay')
    await evaluate(`document.querySelector('${sel}').click()`)
    await until("document.querySelector('.practice-file-page .practice-action-bar')", 8000, 'man file')
  }
  const shared: Shared = { ids, openFile, pointer }

  // =========================== (b) Giao dien chung ===========================
  await step('b1', 'Hai tab sidebar + giu lua chon moi tab', async () => {
    await until("document.querySelector('.sidebar-tabs')", 10000, 'sidebar-tabs')
    const tabs = await evaluate("[...document.querySelectorAll('.sidebar-tab')].map(b => b.textContent.trim() + ':' + b.getAttribute('aria-selected'))")
    if (tabs.length !== 2) throw new Error(`so tab = ${tabs.length}`)
    await shot('b1-tab-initial')
    // Tao 1 chu de + bai hoc o tab Bai hoc
    await evaluate("window.__h.btn('Bài học', '.sidebar-tabs')?.click() ?? [...document.querySelectorAll('.sidebar-tab')][0].click()")
    await sleep(300)
    const topic = await evaluate("window.api.topics.create({ parentId: null, name: 'Chu de test' })")
    const lesson = await evaluate(`window.api.lessons.create({ topicId: ${JSON.stringify(topic.id)}, title: 'Bai hoc test' })`)
    ids.topicId = topic.id; ids.lessonId = lesson.id
    return `tabs: ${tabs.join(' | ')}; da tao chu de/bai hoc`
  })

  await step('b2', 'Chuyen tab qua lai giu view', async () => {
    await cleanLoad()
    // Chon bai hoc o tab Bai hoc
    await until("[...document.querySelectorAll('.tree-label')].some(e => e.textContent.includes('Chu de test'))", 10000, 'chu de trong cay')
    await evaluate("[...document.querySelectorAll('.tree-label')].find(e => e.textContent.includes('Chu de test')).closest('.tree-row').click()")
    await sleep(500)
    await until("[...document.querySelectorAll('.tree-label')].some(e => e.textContent.includes('Bai hoc test'))", 10000, 'bai hoc trong cay')
    await evaluate("[...document.querySelectorAll('.tree-label')].find(e => e.textContent.includes('Bai hoc test')).closest('.tree-row').click()")
    await until("document.querySelector('.app-main-content') && !document.querySelector('.app-main-content.is-practice')", 5000)
    const lessonView = await evaluate("document.querySelector('.app-main-content').innerText.split('\\n')[0]")
    await shot('b2-lesson-view')
    // Sang tab Thuc hanh
    await evaluate("[...document.querySelectorAll('.sidebar-tab')].find(b => b.textContent.includes('Thực hành')).click()")
    await until("document.querySelector('.app-main-content.is-practice')", 5000, 'view practice')
    const practiceTabActive = await evaluate("[...document.querySelectorAll('.sidebar-tab')].find(b => b.textContent.includes('Thực hành')).getAttribute('aria-selected')")
    if (practiceTabActive !== 'true') throw new Error('tab Thuc hanh khong active')
    const treeVisible = await evaluate("(() => { const p = document.querySelector('.app-sidebar-pane:not(.is-hidden) .practice-tree'); return Boolean(p) })()")
    if (!treeVisible) throw new Error('cay Thuc hanh khong hien o tab Thuc hanh')
    await shot('b2-practice-empty')
    // Quay lai Bai hoc: phai ve dung bai hoc da chon
    await evaluate("[...document.querySelectorAll('.sidebar-tab')].find(b => b.textContent.includes('Chủ đề')).click()")
    await sleep(400)
    const back = await evaluate("({ practice: Boolean(document.querySelector('.app-main-content.is-practice')), text: document.querySelector('.app-main-content').innerText.split('\\n')[0] })")
    if (back.practice) throw new Error('quay lai Bai hoc nhung van o khung practice')
    if (back.text !== lessonView) throw new Error(`khung bai hoc doi: "${lessonView}" -> "${back.text}"`)
    return 'chuyen tab 2 chieu, giu bai hoc dang chon'
  })

  await step('b3', 'Sidebar keo hep toi 0 (an) va mo lai', async () => {
    const width = (): Promise<number> => evaluate("Math.round(document.querySelector('.app-sidebar').getBoundingClientRect().width)")
    const w0 = await width()
    const handle = "document.querySelector('.app-sidebar-resize-handle')"
    const hx = await evaluate(`Math.round(${handle}.getBoundingClientRect().left + ${handle}.getBoundingClientRect().width / 2)`)
    await pointer('pointerdown', hx, 300, handle)
    await pointer('pointermove', hx - 100, 300)
    await pointer('pointermove', hx - 200, 300)
    const mid = await width()
    await pointer('pointermove', 0, 300)
    await pointer('pointerup', 0, 300)
    await sleep(200)
    const w1 = await width()
    const collapsed = await evaluate("document.querySelector('.app-sidebar').classList.contains('is-collapsed')")
    await shot('b3-sidebar-hidden')
    if (w1 !== 0 || !collapsed) throw new Error(`sidebar khong an: width=${w1}, collapsed=${collapsed}`)
    // Mo lai bang tay nam (nut reveal)
    const revealRect = await evaluate("(() => { const b = document.querySelector('.app-sidebar-reveal'); const r = b ? b.getBoundingClientRect() : null; return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null })()")
    if (!revealRect || revealRect.w < 4) throw new Error('khong thay tay nam mo lai khi an')
    await evaluate("document.querySelector('.app-sidebar-reveal').click()")
    await sleep(200)
    const w2 = await width()
    if (w2 < 100) throw new Error(`mo lai bang nut that bai: ${w2}`)
    // Keo hep roi keo lai bang tay cam
    const hx2 = await evaluate(`Math.round(${handle}.getBoundingClientRect().left + ${handle}.getBoundingClientRect().width / 2)`)
    await pointer('pointerdown', hx2, 300, handle)
    await pointer('pointermove', 5, 300)
    await pointer('pointerup', 5, 300)
    await sleep(150)
    const w3 = await width()
    const hx3 = await evaluate(`Math.round(${handle}.getBoundingClientRect().left + ${handle}.getBoundingClientRect().width / 2)`)
    await pointer('pointerdown', hx3, 300, handle)
    await pointer('pointermove', hx3 + 300, 300)
    await pointer('pointerup', hx3 + 300, 300)
    await sleep(150)
    const w4 = await width()
    await shot('b3-sidebar-restored')
    if (w3 !== 0) throw new Error(`keo hep lan 2 khong an: ${w3}`)
    if (w4 < 200) throw new Error(`keo lai bang tay cam that bai: ${w4}`)
    return `rong ${w0}px -> ${mid}px (dang keo) -> ${w1}px (an) -> nut mo lai ${w2}px -> keo hep ${w3}px -> keo ra ${w4}px`
  })

  // =========================== (c) Cay thuc hanh ===========================
  await step('c1', 'Tao thu muc bang UI + doi ten', async () => {
    await evaluate("[...document.querySelectorAll('.sidebar-tab')].find(b => b.textContent.includes('Thực hành')).click()")
    await until("window.__h.btn('Thư mục', '.practice-tree-toolbar')", 8000)
    await click('Thư mục', '.practice-tree-toolbar')
    await until("document.querySelector('.practice-tree-rename')", 8000, 'o doi ten thu muc moi')
    await evaluate("(() => { const i = document.querySelector('.practice-tree-rename'); window.__h.setValue(i, 'Giai phau 1'); window.__h.key(i, 'Enter') })()")
    await until("[...document.querySelectorAll('[data-practice-row] .tree-label')].some(e => e.textContent === 'Giai phau 1')", 8000, 'thu muc da doi ten')
    const folders = db.prepare("SELECT id, name FROM practice_nodes WHERE kind='folder'").all() as { id: string; name: string }[]
    if (folders.length !== 1 || folders[0].name !== 'Giai phau 1') throw new Error(`DB folders: ${JSON.stringify(folders)}`)
    ids.folderA = folders[0].id
    // thu muc thu 2 (de test di chuyen)
    await click('Thư mục', '.practice-tree-toolbar')
    await until("document.querySelector('.practice-tree-rename')", 8000)
    await evaluate("(() => { const i = document.querySelector('.practice-tree-rename'); window.__h.setValue(i, 'Giai phau 2'); window.__h.key(i, 'Enter') })()")
    await until("[...document.querySelectorAll('[data-practice-row] .tree-label')].some(e => e.textContent === 'Giai phau 2')", 8000)
    const f2 = db.prepare("SELECT id FROM practice_nodes WHERE name='Giai phau 2'").get() as { id: string } | undefined
    if (!f2) throw new Error('thu muc 2 khong co trong DB')
    ids.folderB = f2.id
    await shot('c1-folders')
    return 'tao 2 thu muc + doi ten qua UI, DB khop'
  })

  await step('c2', 'Them file PDF mau (service thong qua IPC) + hien tren cay', async () => {
    const r1 = await addPracticeFilesFromPaths(null, [h.samples.heThan])
    const r2 = await addPracticeFilesFromPaths(ids.folderA, [h.samples.m11])
    const bad = await addPracticeFilesFromPaths(null, [h.dirs.root + '\\REPORT.md', h.dirs.root + '\\khong-ton-tai.pdf'])
    if (r1.added.length !== 1 || r2.added.length !== 1) throw new Error(`them file that bai ${JSON.stringify([r1.rejected, r2.rejected])}`)
    if (bad.rejected.length !== 2) throw new Error('file khong phai PDF/khong ton tai khong bi tu choi')
    ids.fileHeThan = r1.added[0].id
    ids.fileM11 = r2.added[0].id
    await cleanLoad()
    await evaluate("[...document.querySelectorAll('.sidebar-tab')].find(b => b.textContent.includes('Thực hành')).click()")
    await until("document.querySelectorAll('[data-practice-row]').length >= 3", 8000, 'cay co du dong')
    // mo thu muc A
    await evaluate(`document.querySelector('[data-node-id=${JSON.stringify(ids.folderA)}]').click()`)
    await until(`document.querySelector('[data-node-id=${JSON.stringify(ids.fileM11)}]')`, 5000, 'file M11 trong thu muc A')
    await shot('c2-tree-with-files')
    const t = h.samples.heThan
    return `them 2 PDF OK (${r1.added[0].file?.totalPages} + ${r2.added[0].file?.totalPages} trang); tu choi ${bad.rejected.map((r) => r.reason).join(' / ')}; mau ${t.split('\\').pop()}`
  })

  await step('c3', 'Di chuyen (IPC), doi ten file, tim kiem', async () => {
    await api(`moveNode({ id: ${JSON.stringify(ids.fileHeThan)}, parentId: ${JSON.stringify(ids.folderB)} })`)
    const row = db.prepare('SELECT parent_id FROM practice_nodes WHERE id = ?').get(ids.fileHeThan) as { parent_id: string }
    if (row.parent_id !== ids.folderB) throw new Error('moveNode khong doi parent')
    await api(`moveNode({ id: ${JSON.stringify(ids.fileHeThan)}, parentId: null })`)
    await cleanLoad()
    await evaluate("[...document.querySelectorAll('.sidebar-tab')].find(b => b.textContent.includes('Thực hành')).click()")
    await until(`document.querySelector('[data-node-id=${JSON.stringify(ids.fileHeThan)}]')`, 8000)
    // Doi ten file bang UI (double click)
    await evaluate(`document.querySelector('[data-node-id=${JSON.stringify(ids.fileHeThan)}] .tree-label').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
    await until("document.querySelector('.practice-tree-rename')", 5000, 'o doi ten file')
    await evaluate("(() => { const i = document.querySelector('.practice-tree-rename'); window.__h.setValue(i, 'Tiet nieu mau'); window.__h.key(i, 'Enter') })()")
    await until(`document.querySelector('[data-node-id=${JSON.stringify(ids.fileHeThan)}] .tree-label')?.textContent === 'Tiet nieu mau'`, 5000)
    // Tim kiem
    await evaluate("(() => { const i = document.querySelector('.search-bar input'); window.__h.setValue(i, 'tiet nieu') })()")
    await until("document.querySelector('.practice-search-item')", 8000, 'ket qua tim kiem')
    const found = await evaluate("[...document.querySelectorAll('.practice-search-name')].map(e => e.textContent)")
    await shot('c3-search')
    if (!found.includes('Tiet nieu mau')) throw new Error(`tim 'tiet nieu' khong thay file: ${JSON.stringify(found)}`)
    await evaluate("(() => { const i = document.querySelector('.search-bar input'); window.__h.setValue(i, 'khong co gi het') })()")
    await until("document.querySelector('.app-search-overlay')?.innerText.includes('Không có')", 8000)
    await evaluate("(() => { const i = document.querySelector('.search-bar input'); window.__h.setValue(i, '') })()")
    await sleep(300)
    return `tim thay: ${found.join(', ')}; khong thay khi khop sai`
  })

  await step('c4', 'Xoa file co xac nhan', async () => {
    // Them 1 file tam roi xoa qua UI
    const tmpAdd = await addPracticeFilesFromPaths(ids.folderB, [h.samples.m11])
    const tmpId = tmpAdd.added[0].id
    const storedBefore = (db.prepare('SELECT stored_path FROM practice_files WHERE node_id = ?').get(tmpId) as { stored_path: string }).stored_path
    await cleanLoad()
    await evaluate("[...document.querySelectorAll('.sidebar-tab')].find(b => b.textContent.includes('Thực hành')).click()")
    await until(`document.querySelector('[data-node-id=${JSON.stringify(ids.folderB)}]')`, 8000)
    await evaluate(`document.querySelector('[data-node-id=${JSON.stringify(ids.folderB)}]').click()`)
    await until(`document.querySelector('[data-node-id=${JSON.stringify(tmpId)}]')`, 8000, 'file tam')
    await evaluate(`document.querySelector('[data-node-id=${JSON.stringify(tmpId)}] button[title="Xoá"]').click()`)
    await until("document.querySelector('.confirm-dialog')", 5000, 'hop xac nhan xoa')
    const msg = await evaluate("document.querySelector('.confirm-dialog p').textContent")
    await shot('c4-confirm-delete')
    // Huy truoc: file con
    await click('Huỷ', '.confirm-dialog')
    await sleep(200)
    if (!db.prepare('SELECT 1 FROM practice_nodes WHERE id = ?').get(tmpId)) throw new Error('bam Huy van xoa')
    await evaluate(`document.querySelector('[data-node-id=${JSON.stringify(tmpId)}] button[title="Xoá"]').click()`)
    await until("document.querySelector('.confirm-dialog')", 5000)
    await click('Xoá', '.confirm-dialog')
    await until(`!document.querySelector('[data-node-id=${JSON.stringify(tmpId)}]')`, 8000, 'file bi xoa khoi cay')
    if (db.prepare('SELECT 1 FROM practice_nodes WHERE id = ?').get(tmpId)) throw new Error('DB van con node')
    const { existsSync } = await import('node:fs')
    if (existsSync(storedBefore)) throw new Error('ban sao trong kho khong bi xoa')
    return `xoa co xac nhan OK; thong diep: ${String(msg).slice(0, 70)}...`
  })
  await runScanSteps(step, ctx, shared)
  await diagnoseRecognizer(step, ctx, shared)
  await runEditSteps(step, ctx, shared)
  await runExamSteps(step, ctx, shared)
}
