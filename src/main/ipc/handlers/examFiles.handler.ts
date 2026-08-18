import { ipcMain } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '../../../shared/types/ipcChannels'
import * as examFilesService from '../../services/examFiles.service'

const idSchema = z.object({ id: z.string() })

export function registerExamFilesHandlers(): void {
  ipcMain.handle(IpcChannels.examFiles.list, () => examFilesService.listExamFiles())

  ipcMain.handle(IpcChannels.examFiles.add, () => examFilesService.pickAndAddExamFile())

  ipcMain.handle(IpcChannels.examFiles.remove, (_event, payload) => {
    const { id } = idSchema.parse(payload)
    examFilesService.removeExamFile(id)
  })
}
