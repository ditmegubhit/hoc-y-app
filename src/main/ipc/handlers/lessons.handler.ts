import { ipcMain } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '../../../shared/types/ipcChannels'
import * as lessonsRepo from '../../db/repositories/lessons.repo'

const createLessonSchema = z.object({
  topicId: z.string(),
  title: z.string().trim().min(1).max(300)
})

const updateLessonSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1).max(300).optional(),
  notesJson: z.string().nullable().optional(),
  notesText: z.string().nullable().optional(),
  topicId: z.string().optional(),
  sortOrder: z.number().int().optional()
})

const idSchema = z.object({ id: z.string() })

export function registerLessonsHandlers(): void {
  ipcMain.handle(IpcChannels.lessons.listAll, () => lessonsRepo.listAllLessonSummaries())

  ipcMain.handle(IpcChannels.lessons.get, (_event, payload) => {
    const { id } = idSchema.parse(payload)
    return lessonsRepo.getLesson(id)
  })

  ipcMain.handle(IpcChannels.lessons.create, (_event, payload) => {
    const input = createLessonSchema.parse(payload)
    return lessonsRepo.createLesson(input)
  })

  ipcMain.handle(IpcChannels.lessons.update, (_event, payload) => {
    const input = updateLessonSchema.parse(payload)
    return lessonsRepo.updateLesson(input)
  })

  ipcMain.handle(IpcChannels.lessons.delete, (_event, payload) => {
    const { id } = idSchema.parse(payload)
    lessonsRepo.deleteLesson(id)
  })
}
