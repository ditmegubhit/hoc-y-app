import { ipcMain } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '../../../shared/types/ipcChannels'
import * as topicsRepo from '../../db/repositories/topics.repo'

const createTopicSchema = z.object({
  parentId: z.string().nullable(),
  name: z.string().trim().min(1).max(200)
})

const updateTopicSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(200).optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional()
})

const idSchema = z.object({ id: z.string() })

export function registerTopicsHandlers(): void {
  ipcMain.handle(IpcChannels.topics.list, () => topicsRepo.listTopics())

  ipcMain.handle(IpcChannels.topics.create, (_event, payload) => {
    const input = createTopicSchema.parse(payload)
    return topicsRepo.createTopic(input)
  })

  ipcMain.handle(IpcChannels.topics.update, (_event, payload) => {
    const input = updateTopicSchema.parse(payload)
    return topicsRepo.updateTopic(input)
  })

  ipcMain.handle(IpcChannels.topics.delete, (_event, payload) => {
    const { id } = idSchema.parse(payload)
    topicsRepo.deleteTopic(id)
  })
}
