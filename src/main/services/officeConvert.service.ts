import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { scriptsDir } from './scriptsPath'

// Chuyen doi DOCX/PPTX sang PDF bang chinh Word/PowerPoint (COM automation,
// chay an/it hien cua so - xem resources/scripts/exportOfficeToPdf.vbs), roi
// cache lai theo attachmentId de panel xem file tai su dung toan bo ha tang
// render PDF da co san (pdfRender.ts) - thay cho huong nhung ca cua so ung
// dung that vao panel da bo vi qua bat on dinh.

const CONVERT_TIMEOUT_MS = 45000

function cacheDir(): string {
  return join(app.getPath('userData'), 'officePdfCache')
}

function cachedPdfPath(attachmentId: string): string {
  return join(cacheDir(), `${attachmentId}.pdf`)
}

interface VbsResult {
  success: boolean
  error?: string
}

function runExportScript(
  filePath: string,
  appType: 'docx' | 'pptx',
  outputPath: string
): Promise<VbsResult> {
  return new Promise((resolve) => {
    const scriptPath = join(scriptsDir(), 'exportOfficeToPdf.vbs')
    const child = spawn('cscript.exe', ['//nologo', scriptPath, filePath, appType, outputPath], {
      shell: false
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      resolve({ success: false, error: 'Quá thời gian chờ chuyển đổi.' })
    }, CONVERT_TIMEOUT_MS)

    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ success: false, error: `Không chạy được cscript: ${err.message}` })
    })

    child.on('close', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        resolve(JSON.parse(stdout.trim()) as VbsResult)
      } catch {
        resolve({ success: false, error: stderr.trim() || stdout.trim() || 'Không rõ lỗi.' })
      }
    })
  })
}

// Cache theo attachmentId (file nguon khong doi sau khi upload - khong co
// luong "thay the attachment" trong app nay, xem attachments.repo.ts) - chi
// chuyen doi 1 lan, cac lan mo panel sau tai dung file PDF da cache.
// inFlight tranh spawn nhieu cscript trung nhau khi nhieu request toi gan
// nhau (vd getPageCount va getPageImage cho nhieu trang cung goi luc panel
// vua mo).
const inFlight = new Map<string, Promise<string | null>>()

export async function ensureOfficePdf(
  attachmentId: string,
  sourcePath: string,
  appType: 'docx' | 'pptx'
): Promise<string | null> {
  const outPath = cachedPdfPath(attachmentId)
  if (existsSync(outPath)) return outPath

  const existing = inFlight.get(attachmentId)
  if (existing) return existing

  const task = (async (): Promise<string | null> => {
    try {
      await mkdir(cacheDir(), { recursive: true })
      const result = await runExportScript(sourcePath, appType, outPath)
      if (result.success && existsSync(outPath)) {
        return outPath
      }
      console.error('[officeConvert] chuyển đổi thất bại:', result.error)
      return null
    } finally {
      inFlight.delete(attachmentId)
    }
  })()

  inFlight.set(attachmentId, task)
  return task
}
