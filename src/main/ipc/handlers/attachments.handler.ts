import { ipcMain } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '../../../shared/types/ipcChannels'
import * as attachmentsService from '../../services/attachments.service'

const idSchema = z.object({ id: z.string() })
const lessonIdSchema = z.object({ lessonId: z.string() })

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
}
