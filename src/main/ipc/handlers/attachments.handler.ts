import { ipcMain } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '../../../shared/types/ipcChannels'
import * as attachmentsService from '../../services/attachments.service'
import { getPageImage, getPageCount } from '../../services/attachmentView.service'
import { openAtLocation } from '../../services/attachmentOpen.service'
import * as annotationsRepo from '../../db/repositories/attachmentAnnotations.repo'
import type { NewAnnotation } from '../../../shared/types/annotation'

const idSchema = z.object({ id: z.string() })
const lessonIdSchema = z.object({ lessonId: z.string() })
const pageImageSchema = z.object({
  attachmentId: z.string(),
  unitType: z.string(),
  unitIndex: z.number()
})
const attachmentIdSchema = z.object({ attachmentId: z.string() })
const openAtLocationSchema = z.object({
  attachmentId: z.string(),
  unitType: z.string(),
  unitIndex: z.number(),
  matchedText: z.string()
})
const newAnnotationSchema = z.object({
  id: z.string(),
  pageNumber: z.number(),
  type: z.enum(['highlight', 'pencil', 'note']),
  data: z.record(z.string(), z.unknown())
})
const saveAnnotationsSchema = z.object({
  attachmentId: z.string(),
  annotations: z.array(newAnnotationSchema)
})

export function registerAttachmentsHandlers(): void {
  ipcMain.handle(IpcChannels.attachments.listByLesson, (_event, payload) => {
    const { lessonId } = lessonIdSchema.parse(payload)
    return attachmentsService.listAttachments(lessonId)
  })

  ipcMain.handle(IpcChannels.attachments.add, (_event, payload) => {
    const { lessonId } = lessonIdSchema.parse(payload)
    return attachmentsService.pickAndAddAttachment(lessonId)
  })

  ipcMain.handle(IpcChannels.attachments.remove, (_event, payload) => {
    const { id } = idSchema.parse(payload)
    attachmentsService.removeAttachment(id)
  })

  ipcMain.handle(IpcChannels.attachments.reextract, (_event, payload) => {
    const { id } = idSchema.parse(payload)
    attachmentsService.reextractAttachment(id)
  })

  ipcMain.handle(IpcChannels.attachments.getPageImage, (_event, payload) => {
    const { attachmentId, unitType, unitIndex } = pageImageSchema.parse(payload)
    return getPageImage(attachmentId, unitType, unitIndex)
  })

  ipcMain.handle(IpcChannels.attachments.getPageCount, (_event, payload) => {
    const { attachmentId } = attachmentIdSchema.parse(payload)
    return getPageCount(attachmentId)
  })

  ipcMain.handle(IpcChannels.attachments.openAtLocation, (_event, payload) => {
    const { attachmentId, unitType, unitIndex, matchedText } = openAtLocationSchema.parse(payload)
    return openAtLocation(attachmentId, unitType, unitIndex, matchedText)
  })

  ipcMain.handle(IpcChannels.attachments.getAnnotations, (_event, payload) => {
    const { attachmentId } = attachmentIdSchema.parse(payload)
    return annotationsRepo.listAnnotationsByAttachment(attachmentId)
  })

  ipcMain.handle(IpcChannels.attachments.saveAnnotations, (_event, payload) => {
    const { attachmentId, annotations } = saveAnnotationsSchema.parse(payload)
    // data la JSON tu do theo type (highlight/pencil/note), chi validate o
    // muc "la 1 object" o schema tren - tin tuong hinh dang cu the vi day la
    // du lieu tu chinh renderer cua app nay gui len, khong phai input
    // ben ngoai.
    annotationsRepo.replaceAnnotations(attachmentId, annotations as unknown as NewAnnotation[])
  })
}
