import { app } from 'electron'
import { join } from 'node:path'
import { getDb } from './db'
import { handleProcessStdioErrors } from './services/runtime/stdioErrors'
import { terminatePaddleOcr } from './services/anatomy/paddleOcrClient'
import { terminateVietnameseOcr } from './services/anatomy/vietnameseOcr'
import { getPdfPageCount } from './services/textExtraction/pdfRender'
import { detectPracticePageRegions } from './services/practice/scanPage'
import { runScan } from './services/practice/scanRunner'

// Quet lai (force) cac file thuc hanh bang pipeline hien tai, tren DU LIEU THAT cua app.
// Giu vung user da duyet/ve tay/chi-che (xem scanRunner). Chay khi app dang DONG.
// Chay: npm run practice:rescan [-- --file=<nodeId>]   (khong co --file = tat ca file)

handleProcessStdioErrors(() => { terminatePaddleOcr(); app.exit(1) })

// Chay truc tiep bang electron thi app.name = "hoc-y-app" -> phai tro dung thu muc du lieu cua app.
app.setPath('userData', join(app.getPath('appData'), 'Thach may hoc Y gioi hon tao'))

const only = process.argv.find((arg) => arg.startsWith('--file='))?.split('=')[1]

async function main(): Promise<void> {
  const db = getDb()
  const files = db.prepare('SELECT node_id AS id FROM practice_files').all() as Array<{ id: string }>
  const targets = only ? files.filter((f) => f.id === only) : files
  if (targets.length === 0) throw new Error('Khong co file thuc hanh de quet.')
  for (const { id } of targets) {
    const started = Date.now()
    console.log(`[rescan] bat dau ${id}`)
    const result = await runScan(id, true, {
      detectPage: detectPracticePageRegions,
      countPages: getPdfPageCount,
      emit: (p) => {
        const progress = p as { pageNumber?: number; totalPages?: number }
        if (progress.pageNumber && progress.totalPages && progress.pageNumber % 5 === 0) {
          console.log(`[rescan] ${id} trang ${progress.pageNumber}/${progress.totalPages}`)
        }
      }
    })
    console.log(`[rescan] xong ${id} sau ${Math.round((Date.now() - started) / 1000)}s:`, JSON.stringify(result))
    const stats = db.prepare(
      `SELECT status, reviewed, manual, suspect, COUNT(*) AS n FROM practice_regions
       WHERE file_id = ? GROUP BY status, reviewed, manual, suspect`
    ).all(id)
    console.log('[rescan] thong ke vung:', JSON.stringify(stats))
  }
}

app.whenReady().then(async () => {
  let code = 0
  try {
    await main()
  } catch (error) {
    console.error('[rescan] LOI:', error)
    code = 1
  } finally {
    terminatePaddleOcr()
    await terminateVietnameseOcr()
    app.exit(code)
  }
})
