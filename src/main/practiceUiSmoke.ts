import { app, BrowserWindow } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { handleProcessStdioErrors } from './services/runtime/stdioErrors'
import { terminatePaddleOcr } from './services/anatomy/paddleOcrClient'
import { terminateVietnameseOcr } from './services/anatomy/vietnameseOcr'
import { runPracticeUiScenario, type Harness } from './practiceUiScenario'

// Harness kiem tra end-to-end khu Thuc hanh GP trong Electron that (cua so AN, KHONG bao gio show/focus).
// Chay: npm run practice:smoke [-- --keep --steps=a,b,c --migration]
//  - userData co lap: tmp/practice-ui-smoke/app-data (XOA va dung moi moi lan, tru khi --keep)
//  - anh chup: tmp/practice-ui-smoke/shots, bao cao: tmp/practice-ui-smoke/REPORT.md
//  - --migration: chi chay muc (a) tren ban sao DB that (migration 021 -> 023), roi thoat.

handleProcessStdioErrors(() => { terminatePaddleOcr(); app.exit(1) })

const root = resolve('tmp/practice-ui-smoke')
const shotsDir = join(root, 'shots')
const samplesDir = join(root, 'samples')
const reportPath = join(root, 'REPORT.md')
const migrationMode = process.argv.includes('--migration')
const keep = process.argv.includes('--keep')
const appData = join(root, migrationMode ? 'migration-real' : 'app-data')

const ATTACH = 'C:/Users/HP/AppData/Roaming/Thach may hoc Y gioi hon tao/attachments'
const HE_THAN = join(ATTACH, 'c1383f40-6d10-42c9-8b44-b45de8604c82.pdf')
const M11 = join(ATTACH, '2d944a2a-2597-48aa-acb2-da913f7d9652.pdf')
const BACKUP_DB = 'D:/Game/Claude Claude Claude/Claude Code/hoc-y-app-backup-2026-10-06/hoc-y-app.sqlite3'

// Chi duoc xoa BEN TRONG thu muc tmp/practice-ui-smoke cua harness.
function safeRemove(path: string): void {
  const normalized = resolve(path)
  if (!normalized.startsWith(root + '\\') && normalized !== root) throw new Error(`Tu choi xoa ngoai thu muc harness: ${normalized}`)
  rmSync(normalized, { recursive: true, force: true })
}

if (!keep) safeRemove(appData)
mkdirSync(appData, { recursive: true })
mkdirSync(shotsDir, { recursive: true })
mkdirSync(samplesDir, { recursive: true })
app.setPath('userData', appData)

async function makeSample(source: string, pages: number[], outName: string): Promise<string> {
  const out = join(samplesDir, outName)
  if (existsSync(out)) return out
  const src = await PDFDocument.load(readFileSync(source), { ignoreEncryption: true })
  const dst = await PDFDocument.create()
  const copied = await dst.copyPages(src, pages.map((p) => p - 1))
  copied.forEach((p) => dst.addPage(p))
  writeFileSync(out, await dst.save())
  return out
}

const log = (line: string): void => {
  console.log(line)
  appendFileSync(reportPath, line + '\n')
}

app.whenReady().then(async () => {
  let exitCode = 0
  if (!existsSync(reportPath) || !keep) writeFileSync(reportPath, `# practice:smoke ${new Date().toISOString()}\n\n`)
  else appendFileSync(reportPath, `\n---- chay tiep ${new Date().toISOString()} ----\n`)
  const consoleErrors: string[] = []
  let window: BrowserWindow | null = null
  try {
    if (migrationMode) {
      for (const suffix of ['', '-shm', '-wal']) {
        if (existsSync(BACKUP_DB + suffix)) copyFileSync(BACKUP_DB + suffix, join(appData, 'hoc-y-app.sqlite3' + suffix))
      }
    }
    const heThan = await makeSample(HE_THAN, [1, 13, 46], 'He-than-p1-13-46.pdf')
    const m11 = await makeSample(M11, [3, 40], 'M11-p3-40.pdf')

    window = new BrowserWindow({
      show: false, width: 1440, height: 900,
      webPreferences: {
        preload: resolve('out/preload/index.js'), sandbox: true, contextIsolation: true,
        nodeIntegration: false, backgroundThrottling: false
      }
    })
    const win = window
    win.webContents.on('console-message', (event: any, ...rest: any[]) => {
      const level = event?.level ?? rest[0]
      const message: string = event?.message ?? rest[1]
      const isError = level === 'error' || level === 3
      if (isError) {
        consoleErrors.push(String(message))
        console.log(`[renderer-error] ${message}`)
      }
    })
    win.webContents.on('render-process-gone', (_e, details) => { consoleErrors.push(`render-process-gone ${details.reason}`) })

    const evaluate = (code: string): Promise<any> => win.webContents.executeJavaScript(code)
    const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    const until = async (code: string, timeoutMs = 20000, what = code): Promise<void> => {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        let ok = false
        try { ok = Boolean(await evaluate(code)) } catch { ok = false }
        if (ok) return
        if (Date.now() > deadline) throw new Error(`UI timeout: ${what}`)
        await sleep(100)
      }
    }
    const shot = async (name: string): Promise<string> => {
      await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
      await sleep(150)
      const image = await Promise.race([
        win.webContents.capturePage(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('capturePage timeout')), 8000))
      ])
      const path = join(shotsDir, `${name}.png`)
      writeFileSync(path, image.toPNG())
      return path
    }
    const harness: Harness = {
      win, evaluate, until, sleep, shot, log, consoleErrors, samples: { heThan, m11 },
      dirs: { root, shotsDir, samplesDir, appData }, migrationMode, backupDbPath: BACKUP_DB,
      stepFilter: (process.argv.find((a) => a.startsWith('--steps='))?.slice(8) ?? '').split(',').filter(Boolean),
      keep, safeRemove, listShots: () => readdirSync(shotsDir)
    }
    const failures = await runPracticeUiScenario(harness)
    if (failures > 0) exitCode = 1
  } catch (error) {
    console.error(error)
    log(`FATAL: ${error instanceof Error ? error.stack : String(error)}`)
    exitCode = 1
    try { if (window) writeFileSync(join(shotsDir, 'fatal.png'), (await window.webContents.capturePage()).toPNG()) } catch { /* bo qua */ }
  } finally {
    if (consoleErrors.length > 0) {
      log(`CONSOLE ERRORS (${consoleErrors.length}):\n${consoleErrors.slice(0, 40).join('\n')}`)
      exitCode = 1
    }
    await terminateVietnameseOcr().catch(() => undefined)
    terminatePaddleOcr()
    window?.destroy()
    app.exit(exitCode)
  }
})
