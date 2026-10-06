import { dialog } from 'electron'
import { open, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import * as nodesRepo from '../../db/repositories/practiceNodes.repo'
import { getPdfPageCount } from '../textExtraction/pdfRender'
import { deleteStoredPracticeFile, storePracticeFile } from './practiceStorage'
import type { PracticeAddFilesResult } from '../../../shared/types/practice'

// Chi nhan PDF that: dung duoi .pdf VA 5 byte dau la "%PDF-".
async function looksLikePdf(path: string): Promise<boolean> {
  if (extname(path).toLowerCase() !== '.pdf') return false
  let handle
  try {
    handle = await open(path, 'r')
    const buffer = Buffer.alloc(5)
    const { bytesRead } = await handle.read(buffer, 0, 5, 0)
    return bytesRead === 5 && buffer.toString('latin1') === '%PDF-'
  } catch {
    return false
  } finally {
    await handle?.close()
  }
}

function displayName(path: string): string {
  const base = basename(path)
  return base.replace(/\.pdf$/i, '').trim() || base
}

/** Them cac PDF vao khu thuc hanh: kiem tra -> sao chep vao kho -> doc so trang -> tao node. File loi duoc bao trong `rejected`. */
export async function addPracticeFilesFromPaths(
  parentId: string | null,
  paths: string[]
): Promise<PracticeAddFilesResult> {
  if (parentId !== null) {
    const parent = nodesRepo.getNode(parentId)
    if (!parent || parent.kind !== 'folder') throw new Error('Không tìm thấy thư mục để thêm file vào.')
  }
  const result: PracticeAddFilesResult = { added: [], rejected: [] }
  for (const path of [...new Set(paths)]) {
    const info = await stat(path).catch(() => null)
    if (!info) {
      result.rejected.push({ path, reason: 'Không tìm thấy file.' })
      continue
    }
    if (info.isDirectory()) {
      result.rejected.push({ path, reason: 'Đây là thư mục, chỉ thêm được file PDF.' })
      continue
    }
    if (!(await looksLikePdf(path))) {
      result.rejected.push({ path, reason: 'Không phải file PDF.' })
      continue
    }

    let storedPath: string | null = null
    try {
      const stored = await storePracticeFile(path)
      storedPath = stored.storedPath
      const totalPages = await getPdfPageCount(stored.storedPath)
      if (!totalPages || totalPages < 1) throw new Error('PDF không có trang nào.')
      const node = nodesRepo.createFileNode({
        parentId,
        name: displayName(path),
        storedPath: stored.storedPath,
        fileSizeBytes: stored.fileSizeBytes,
        sourcePath: path,
        sourceMtimeMs: info.mtimeMs,
        totalPages
      })
      result.added.push(node)
    } catch (error) {
      if (storedPath) await deleteStoredPracticeFile(storedPath)
      console.error('[practice] không thêm được file:', path, error)
      result.rejected.push({ path, reason: 'File PDF bị lỗi hoặc không đọc được.' })
    }
  }
  return result
}

export async function pickAndAddPracticeFiles(parentId: string | null): Promise<PracticeAddFilesResult> {
  const picked = await dialog.showOpenDialog({
    title: 'Chọn file PDF thực hành',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (picked.canceled || picked.filePaths.length === 0) return { added: [], rejected: [] }
  return addPracticeFilesFromPaths(parentId, picked.filePaths)
}
