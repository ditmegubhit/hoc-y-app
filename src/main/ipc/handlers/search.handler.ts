import { ipcMain } from 'electron'
import { z } from 'zod'
import { IpcChannels } from '../../../shared/types/ipcChannels'
import { searchAll, getHighlightedChunk } from '../../services/search.service'

const querySchema = z.object({ keyword: z.string() })
const highlightedChunkSchema = z.object({
  sourceType: z.enum(['lesson_note', 'attachment']),
  sourceId: z.string(),
  unitType: z.string(),
  unitIndex: z.number(),
  keyword: z.string()
})

export function registerSearchHandlers(): void {
  ipcMain.handle(IpcChannels.search.query, (_event, payload) => {
    const { keyword } = querySchema.parse(payload)
    return searchAll(keyword)
  })

  ipcMain.handle(IpcChannels.search.getHighlightedChunk, (_event, payload) => {
    const query = highlightedChunkSchema.parse(payload)
    return getHighlightedChunk(query)
  })
}
