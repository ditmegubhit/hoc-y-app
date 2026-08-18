import { ipcMain } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '../../../shared/types/ipcChannels'
import { searchAll } from '../../services/search.service'

const querySchema = z.object({ keyword: z.string() })

export function registerSearchHandlers(): void {
  ipcMain.handle(IpcChannels.search.query, (_event, payload) => {
    const { keyword } = querySchema.parse(payload)
    return searchAll(keyword)
  })
}
