import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { app, shell } from 'electron'
import { join } from 'node:path'
import * as attachmentsRepo from '../db/repositories/attachments.repo'
import * as wordPositionsRepo from '../db/repositories/wordPositions.repo'
import { findWordRunForText, unionRectsByLine } from './highlight/wordMatch'
import { createHighlightedPdfCopy } from './highlight/pdfHighlight.service'
import { createHighlightedImageCopy } from './highlight/imageHighlight.service'

// PDF: da thu ep nhay trang qua app mac dinh cua he thong (WPS: khong hieu
// tham so; Foxit: chan boi hop thoai xac nhan roi van bo qua tham so, ke ca
// sau khi tat Safe Reading Mode) - khong on dinh. Trinh duyet goc Chromium
// mo bang --new-window (thay vi dua vao app mac dinh, tranh bi tai su dung
// tab/cua so cu dang hien vi tri cuon truoc do) la cach duy nhat xac nhan mo
// dung trang duoc. User chon Coc Coc lam trinh duyet uu tien; Edge la du
// phong (cung Chromium, cung co --new-window) neu may khong co Coc Coc.
export interface OpenAtLocationResult {
  success: boolean
  message?: string
}

const CHROMIUM_BROWSER_CANDIDATES = [
  join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'CocCoc\\Browser\\Application\\browser.exe'),
  join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'CocCoc\\Browser\\Application\\browser.exe'
  ),
  join(process.env['LocalAppData'] ?? '', 'CocCoc\\Browser\\Application\\browser.exe'),
  join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
  join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Microsoft\\Edge\\Application\\msedge.exe'
  ),
  join(process.env['LocalAppData'] ?? '', 'Microsoft\\Edge\\Application\\msedge.exe')
]

function findChromiumBrowserPath(): string | null {
  for (const candidate of CHROMIUM_BROWSER_CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return null
}

function spawnBrowserNewWindow(browserPath: string, targetUrl: string): Promise<OpenAtLocationResult> {
  return new Promise((resolve) => {
    const child = spawn(browserPath, ['--new-window', targetUrl], {
      shell: false,
      detached: true,
      stdio: 'ignore'
    })
    child.once('error', (err) => {
      resolve({ success: false, message: `Không mở được trình duyệt: ${err.message}` })
    })
    child.once('spawn', () => {
      child.unref()
      resolve({ success: true })
    })
  })
}

// electron-vite bundle toan bo src/main/**/*.ts vao 1 file out/main/index.js,
// nen __dirname trong moi module main deu tro ve out/main/ (giong pattern
// ocr/resourcePaths.ts).
function scriptsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'scripts')
    : join(__dirname, '../../resources/scripts')
}

function openOfficeAtLocation(
  filePath: string,
  appType: 'pptx' | 'docx',
  unitIndex: number,
  matchedText: string
): Promise<OpenAtLocationResult> {
  return new Promise((resolve) => {
    const scriptPath = join(scriptsDir(), 'openOfficeAtLocation.vbs')
    // args dang mang, khong dung noi chuoi lenh - cscript/WSH tu nhan tung
    // argv rieng biet, tranh injection du matchedText den tu tu khoa nguoi
    // dung go (co the chua ky tu dac biet).
    const child = spawn(
      'cscript.exe',
      ['//nologo', scriptPath, filePath, appType, String(unitIndex), matchedText],
      { shell: false }
    )

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))

    child.on('error', (err) => {
      resolve({ success: false, message: `Không chạy được cscript: ${err.message}` })
    })

    child.on('close', () => {
      try {
        const parsed = JSON.parse(stdout.trim()) as OpenAtLocationResult
        resolve(parsed)
      } catch {
        resolve({
          success: false,
          message: stderr.trim() || stdout.trim() || 'Không rõ lỗi khi mở file.'
        })
      }
    })
  })
}

export async function openAtLocation(
  attachmentId: string,
  unitType: string,
  unitIndex: number,
  matchedText: string
): Promise<OpenAtLocationResult> {
  const attachment = attachmentsRepo.getAttachment(attachmentId)
  if (!attachment) return { success: false, message: 'Không tìm thấy file đính kèm.' }

  if (attachment.fileType === 'pdf') {
    let targetPath = attachment.storedPath
    if (unitType === 'page' && matchedText) {
      try {
        const words = wordPositionsRepo.getWordPositions('attachment', attachmentId, 'page', unitIndex)
        const run = words.length ? findWordRunForText(words, matchedText) : null
        if (run) {
          const rects = unionRectsByLine(run)
          targetPath = await createHighlightedPdfCopy(
            attachment.storedPath,
            unitIndex,
            rects,
            run[0].coordSpace,
            run[0].refWidth,
            run[0].refHeight
          )
        }
      } catch (err) {
        console.error('[attachmentOpen] tạo bản PDF tô màu thất bại, dùng file gốc:', err)
      }
    }

    const fileUrl = pathToFileURL(targetPath).href
    const target = unitType === 'page' ? `${fileUrl}#page=${unitIndex}` : fileUrl

    const browserPath = findChromiumBrowserPath()
    if (browserPath) {
      return spawnBrowserNewWindow(browserPath, target)
    }

    try {
      await shell.openExternal(target)
      return { success: true }
    } catch (err) {
      return { success: false, message: `Không mở được PDF: ${(err as Error).message}` }
    }
  }

  if (
    attachment.fileType === 'png' ||
    attachment.fileType === 'jpg' ||
    attachment.fileType === 'jpeg'
  ) {
    let openPath = attachment.storedPath
    if (matchedText) {
      try {
        const words = wordPositionsRepo.getWordPositions('attachment', attachmentId, 'image', 1)
        const run = words.length ? findWordRunForText(words, matchedText) : null
        if (run) {
          openPath = await createHighlightedImageCopy(attachment.storedPath, unionRectsByLine(run))
        }
      } catch (err) {
        console.error('[attachmentOpen] tạo bản ảnh tô màu thất bại, dùng file gốc:', err)
      }
    }

    const errorMessage = await shell.openPath(openPath)
    return errorMessage ? { success: false, message: errorMessage } : { success: true }
  }

  if (attachment.fileType === 'docx' || attachment.fileType === 'pptx') {
    return openOfficeAtLocation(attachment.storedPath, attachment.fileType, unitIndex, matchedText)
  }

  return { success: false, message: 'Loại file này không hỗ trợ mở tại vị trí.' }
}
