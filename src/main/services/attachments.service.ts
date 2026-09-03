import { dialog, BrowserWindow } from 'electron'
import type { Dirent } from 'node:fs'
import { extname, join } from 'node:path'
import { stat, readdir } from 'node:fs/promises'
import { storeAttachmentFile, deleteStoredFile } from './fileStorage.service'
import { invalidateOfficePdfCache } from './officeConvert.service'
import { detectExtractableType, extractText, type ExtractableFileType } from './textExtraction'
import * as attachmentsRepo from '../db/repositories/attachments.repo'
import * as lessonsRepo from '../db/repositories/lessons.repo'
import * as searchIndexRepo from '../db/repositories/searchIndex.repo'
import * as wordPositionsRepo from '../db/repositories/wordPositions.repo'
import type { Attachment, AttachmentFileType } from '../../shared/types/attachment'

// Van co the co text OCR ra 1-2 ky tu rac (nhieu/mo) - khong tinh la "co noi
// dung" de tranh gay hieu lam da lap chi muc tim kiem duoc.
const MIN_USEFUL_TEXT_CHARS = 3

// .doc/.ppt (Office 97-2003) duoc quy ve dung loai 'docx'/'pptx' - Word/
// PowerPoint mo ca 2 dinh dang nhu nhau nen phan xem/chuyen PDF/mo tai vi
// tri khong can biet su khac biet; chi buoc trich xuat text di duong rieng
// (xem detectExtractableType -> 'docLegacy'/'pptLegacy').
const SUPPORTED_EXTENSIONS: Record<string, AttachmentFileType> = {
  '.pdf': 'pdf',
  '.doc': 'docx',
  '.docx': 'docx',
  '.ppt': 'pptx',
  '.pptx': 'pptx',
  '.png': 'png',
  '.jpg': 'jpg',
  '.jpeg': 'jpeg'
}

const DOC_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg']

function notifyExtractionUpdated(attachmentId: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('attachments:extractionUpdated', { attachmentId })
  }
}

export async function pickAndAddAttachment(lessonId: string): Promise<Attachment[]> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Tài liệu học tập', extensions: DOC_EXTENSIONS }]
  })
  if (result.canceled || result.filePaths.length === 0) return []

  // Them tuan tu - moi file tu spawn viec trich xuat rieng (fire-and-forget)
  // nen khong can song song o day; 1 file loi khong lam hong ca lo.
  const added: Attachment[] = []
  for (const filePath of result.filePaths) {
    try {
      added.push(await addAttachmentFromPath(lessonId, filePath))
    } catch (err) {
      console.error('[attachments] không thêm được file:', filePath, err)
    }
  }
  return added
}

export async function addAttachmentFromPath(
  lessonId: string,
  sourcePath: string
): Promise<Attachment> {
  const ext = extname(sourcePath).toLowerCase()
  const fileType = SUPPORTED_EXTENSIONS[ext] ?? 'other'

  const stored = await storeAttachmentFile(sourcePath)
  const extractable = detectExtractableType(sourcePath)
  const sourceMtimeMs = await stat(sourcePath)
    .then((s) => s.mtimeMs)
    .catch(() => null)

  const attachment = attachmentsRepo.createAttachment({
    lessonId,
    fileName: stored.fileName,
    fileType,
    storedPath: stored.storedPath,
    fileSizeBytes: stored.fileSizeBytes,
    extractionStatus: extractable ? 'pending' : 'not_supported',
    sourcePath,
    sourceMtimeMs
  })

  if (extractable) {
    void extractAndIndex(attachment.id, stored.storedPath, extractable, lessonId)
  }

  return attachment
}

async function extractAndIndex(
  attachmentId: string,
  storedPath: string,
  type: ExtractableFileType,
  lessonId: string
): Promise<void> {
  try {
    const chunks = await extractText(
      storedPath,
      type,
      () => {
        attachmentsRepo.markAttachmentOcrProcessing(attachmentId)
        notifyExtractionUpdated(attachmentId)
      },
      attachmentId
    )
    const text = chunks.map((c) => c.text).join('\n\n')
    const status = text.trim().length >= MIN_USEFUL_TEXT_CHARS ? 'done' : 'done_empty'
    attachmentsRepo.updateAttachmentExtraction(attachmentId, status, text)

    wordPositionsRepo.replaceWordPositions({
      sourceType: 'attachment',
      sourceId: attachmentId,
      chunks
    })

    const lesson = lessonsRepo.getLesson(lessonId)
    if (lesson) {
      searchIndexRepo.replaceSearchIndexEntries({
        sourceType: 'attachment',
        sourceId: attachmentId,
        lessonId: lesson.id,
        topicId: lesson.topicId,
        title: lesson.title,
        chunks
      })
    }
  } catch (err) {
    console.error('[attachments] extraction failed:', err)
    attachmentsRepo.updateAttachmentExtraction(attachmentId, 'failed', null)
  } finally {
    notifyExtractionUpdated(attachmentId)
  }
}

// Chay khi app khoi dong: file cu bi ket o 'done_empty' (bug gan nham 'done'
// truoc khi co OCR) hoac do dang do app tat dot ngot duoc tu dong xu ly lai
// bang pipeline OCR moi, khong can user thao tac gi.
export function requeueStuckExtractions(): void {
  const stuck = attachmentsRepo.listAttachmentsNeedingReextraction()
  for (const att of stuck) {
    const type = detectExtractableType(att.storedPath)
    if (!type) continue
    void extractAndIndex(att.id, att.storedPath, type, att.lessonId)
  }
}

// ---------- Tu dong dong bo khi file goc bi sua ngoai app ----------

const syncing = new Set<string>()
let lastFullSyncMs = 0
const FULL_SYNC_MIN_INTERVAL_MS = 15_000

async function syncOne(row: attachmentsRepo.SyncableAttachment): Promise<void> {
  if (syncing.has(row.id)) return
  syncing.add(row.id)
  try {
    const st = await stat(row.sourcePath).catch(() => null)
    if (!st) return // file goc da bi di chuyen/xoa - giu ban sao hien co
    if (row.sourceMtimeMs != null && st.mtimeMs <= row.sourceMtimeMs) return // chua doi

    const fresh = await storeAttachmentFile(row.sourcePath)
    const oldStored = row.storedPath
    attachmentsRepo.updateAttachmentSource(row.id, {
      storedPath: fresh.storedPath,
      fileSizeBytes: fresh.fileSizeBytes,
      sourceMtimeMs: st.mtimeMs
    })
    await deleteStoredFile(oldStored)
    await invalidateOfficePdfCache(row.id) // docx/pptx: xoa PDF cache cu

    const type = detectExtractableType(fresh.storedPath)
    if (type) {
      attachmentsRepo.updateAttachmentExtraction(row.id, 'pending', null)
      notifyExtractionUpdated(row.id)
      await extractAndIndex(row.id, fresh.storedPath, type, row.lessonId)
    } else {
      notifyExtractionUpdated(row.id)
    }
    console.log('[attachments] synced from source:', row.sourcePath)
  } catch (err) {
    console.error('[attachments] sync failed for', row.sourcePath, err)
  } finally {
    syncing.delete(row.id)
  }
}

export function syncLessonAttachments(lessonId: string): void {
  for (const row of attachmentsRepo.listSyncableAttachments(lessonId)) {
    void syncOne(row)
  }
}

function syncAttachmentById(id: string): void {
  const att = attachmentsRepo.getAttachment(id)
  if (!att || !att.sourcePath) return
  void syncOne({
    id: att.id,
    lessonId: att.lessonId,
    storedPath: att.storedPath,
    sourcePath: att.sourcePath,
    sourceMtimeMs: null
  })
}

// ---------- Lien ket file goc cho cac file da them tu truoc ----------

const LINK_FILTERS = [{ name: 'Tài liệu học tập', extensions: DOC_EXTENSIONS }]

export async function pickAndLinkAttachmentSource(
  attachmentId: string
): Promise<Attachment | null> {
  const att = attachmentsRepo.getAttachment(attachmentId)
  if (!att) return null

  const result = await dialog.showOpenDialog({
    title: `Chọn file gốc cho "${att.fileName}"`,
    properties: ['openFile'],
    filters: LINK_FILTERS
  })
  if (result.canceled || result.filePaths.length === 0) return null

  attachmentsRepo.linkAttachmentSource(attachmentId, result.filePaths[0])
  syncAttachmentById(attachmentId) // keo noi dung hien tai ve
  return attachmentsRepo.getAttachment(attachmentId)
}

async function walkFiles(dir: string, budget: { left: number }): Promise<Map<string, string[]>> {
  const byName = new Map<string, string[]>()

  async function recurse(current: string): Promise<void> {
    if (budget.left <= 0) return
    let entries: Dirent[]
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (budget.left <= 0) return
      const full = join(current, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue
        await recurse(full)
      } else if (e.isFile()) {
        budget.left -= 1
        const list = byName.get(e.name) ?? []
        list.push(full)
        byName.set(e.name, list)
      }
    }
  }

  await recurse(dir)
  return byName
}

export interface BulkLinkResult {
  total: number
  matched: number
  ambiguous: number
}

export async function bulkLinkAttachmentSources(): Promise<BulkLinkResult | null> {
  const missing = attachmentsRepo.listAttachmentsWithoutSource()
  if (missing.length === 0) return { total: 0, matched: 0, ambiguous: 0 }

  const result = await dialog.showOpenDialog({
    title: 'Chọn thư mục chứa các file gốc',
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const byName = await walkFiles(result.filePaths[0], { left: 40_000 })

  let matched = 0
  let ambiguous = 0
  for (const att of missing) {
    const candidates = byName.get(att.fileName)
    if (!candidates || candidates.length === 0) continue
    if (candidates.length > 1) {
      ambiguous += 1
      continue
    }
    attachmentsRepo.linkAttachmentSource(att.id, candidates[0])
    syncAttachmentById(att.id)
    matched += 1
  }

  return { total: missing.length, matched, ambiguous }
}

export function syncAllAttachments(): void {
  lastFullSyncMs = Date.now()
  for (const row of attachmentsRepo.listSyncableAttachments()) {
    void syncOne(row)
  }
}

// Goi khi cua so duoc focus lai - chan bot tan suat.
export function maybeSyncAllAttachments(): void {
  if (Date.now() - lastFullSyncMs < FULL_SYNC_MIN_INTERVAL_MS) return
  syncAllAttachments()
}

export function reextractAttachment(attachmentId: string): void {
  const attachment = attachmentsRepo.getAttachment(attachmentId)
  if (!attachment) return
  const type = detectExtractableType(attachment.storedPath)
  if (!type) return
  attachmentsRepo.updateAttachmentExtraction(attachmentId, 'pending', attachment.extractedText)
  void extractAndIndex(attachmentId, attachment.storedPath, type, attachment.lessonId)
}

export function removeAttachment(id: string): void {
  attachmentsRepo.deleteAttachment(id)
}

export function listAttachments(lessonId: string): Attachment[] {
  return attachmentsRepo.listAttachmentsByLesson(lessonId)
}
