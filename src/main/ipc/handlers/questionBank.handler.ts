import { ipcMain } from 'electron'
import { IpcChannels } from '../../../shared/types/ipcChannels'
import * as questionBankRepo from '../../db/repositories/questionBank.repo'

export function registerQuestionBankHandlers(): void {
  ipcMain.handle(IpcChannels.questionBank.countAll, () => questionBankRepo.countAll())
}
