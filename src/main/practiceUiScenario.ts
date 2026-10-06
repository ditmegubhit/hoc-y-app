import type { BrowserWindow } from 'electron'
import { resolve, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { getDb } from './db'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'
import { runSteps } from './practiceUiSteps'

// Kich ban kiem tra khu Thuc hanh GP (goi tu practiceUiSmoke.ts). Moi muc: ghi PASS/FAIL vao REPORT.md.

export interface Harness {
  win: BrowserWindow
  evaluate: (code: string) => Promise<any>
  until: (code: string, timeoutMs?: number, what?: string) => Promise<void>
  sleep: (ms: number) => Promise<void>
  shot: (name: string) => Promise<string>
  log: (line: string) => void
  consoleErrors: string[]
  samples: { heThan: string; m11: string }
  dirs: { root: string; shotsDir: string; samplesDir: string; appData: string }
  migrationMode: boolean
  backupDbPath: string
  stepFilter: string[]
  keep: boolean
  safeRemove: (path: string) => void
  listShots: () => string[]
}

// Cac ham tien ich chay trong renderer (tiem lai sau moi lan nap trang).
const HELPERS = `
window.__h = {
  vis(e) { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' },
  btn(text, scope) {
    const root = scope ? document.querySelector(scope) : document
    if (!root) return null
    return [...root.querySelectorAll('button')].find(b => b.textContent.trim() === text && this.vis(b)) || null
  },
  btnContains(text, scope) {
    const root = scope ? document.querySelector(scope) : document
    if (!root) return null
    return [...root.querySelectorAll('button')].find(b => b.textContent.includes(text) && this.vis(b)) || null
  },
  setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  },
  key(el, key, opts) {
    const ev = new KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, opts || {}))
    el.dispatchEvent(ev)
    return ev.defaultPrevented
  }
}
`

export async function runPracticeUiScenario(h: Harness): Promise<number> {
  const { win, evaluate, until, sleep, shot, log } = h
  let failures = 0
  const results: { id: string; ok: boolean; note: string }[] = []

  const step = async (id: string, title: string, fn: () => Promise<string>): Promise<void> => {
    if (h.stepFilter.length > 0 && !h.stepFilter.some((f) => id.startsWith(f))) return
    const t0 = Date.now()
    const errorsBefore = h.consoleErrors.length
    try {
      const note = await fn()
      const newErrors = h.consoleErrors.length - errorsBefore
      if (newErrors > 0) throw new Error(`co ${newErrors} loi console: ${h.consoleErrors.slice(errorsBefore, errorsBefore + 3).join(' | ')}`)
      results.push({ id, ok: true, note })
      log(`PASS [${id}] ${title} (${Date.now() - t0}ms) - ${note}`)
    } catch (error) {
      failures += 1
      const message = error instanceof Error ? error.message : String(error)
      results.push({ id, ok: false, note: message })
      log(`FAIL [${id}] ${title} (${Date.now() - t0}ms) - ${message}`)
      try { await shot(`FAIL-${id.replace(/\W/g, '_')}`) } catch { /* bo qua */ }
    }
  }

  const db = getDb()
  registerIpcHandlers()
  const cleanLoad = async (): Promise<void> => {
    await win.loadFile(resolve('out/renderer/index.html'))
    await evaluate(HELPERS + ";true")
    await until("document.querySelector('.app-layout')", 15000, 'app-layout')
  }
  const api = (expr: string): Promise<any> => evaluate(`(async () => { const r = await window.api.practice.${expr}; return JSON.parse(JSON.stringify(r ?? null)) })()`)
  const click = async (text: string, scope?: string): Promise<void> => {
    const s = scope ? JSON.stringify(scope) : 'null'
    await until(`Boolean(window.__h.btn(${JSON.stringify(text)}, ${s}))`, 10000, `nut "${text}"`)
    await evaluate(`window.__h.btn(${JSON.stringify(text)}, ${s}).click()`)
  }
  const tableCount = (name: string): number => (db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get() as { n: number }).n
  const tableExists = (name: string): boolean => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name))
  const ctx = { db, api, click, cleanLoad, tableCount, tableExists, h }

  // =========================== (a) MIGRATION ===========================
  await step('a1', 'Migration tren DB', async () => {
    const applied = (db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as { id: string }[]).map((r) => r.id)
    const need = ['022', '023']
    for (const prefix of need) if (!applied.some((id) => id.startsWith(prefix))) throw new Error(`thieu migration ${prefix}; co ${applied.slice(-4).join(',')}`)
    const tables = ['practice_nodes', 'practice_files', 'practice_regions', 'practice_station_sets', 'practice_attempts']
    for (const t of tables) if (!tableExists(t)) throw new Error(`thieu bang ${t}`)
    let note = `migrations ${applied.length} (cuoi ${applied[applied.length - 1]}); bang practice_* OK`
    if (h.migrationMode) {
      const q = tableCount('anatomy_questions')
      if (q !== 2629) throw new Error(`anatomy_questions = ${q}, ky vong 2629`)
      note += `; anatomy_questions=${q}, anatomy_label_candidates=${tableCount('anatomy_label_candidates')}`
    }
    return note
  })
  await cleanLoad()
  await step('a2', 'App khoi dong tren DB nay, listNodes rong', async () => {
    const nodes = await api('listNodes()')
    if (!Array.isArray(nodes)) throw new Error('listNodes khong tra mang')
    if (h.migrationMode && nodes.length !== 0) throw new Error(`listNodes tra ${nodes.length} node`)
    await shot(h.migrationMode ? 'a-migration-real' : 'a-fresh')
    return `listNodes -> ${nodes.length} node`
  })
  if (h.migrationMode) {
    writeFileSync(join(h.dirs.root, 'migration-done.txt'), 'ok')
    return failures
  }

  await runSteps(step, ctx)
  log(`\nTONG: ${results.filter((r) => r.ok).length} PASS, ${failures} FAIL`)
  return failures
}

export type ScenarioContext = {
  db: ReturnType<typeof getDb>
  api: (expr: string) => Promise<any>
  click: (text: string, scope?: string) => Promise<void>
  cleanLoad: () => Promise<void>
  tableCount: (name: string) => number
  tableExists: (name: string) => boolean
  h: Harness
}
export type StepFn = (id: string, title: string, fn: () => Promise<string>) => Promise<void>
