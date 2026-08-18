import { registerTopicsHandlers } from './handlers/topics.handler'
import { registerLessonsHandlers } from './handlers/lessons.handler'
import { registerAttachmentsHandlers } from './handlers/attachments.handler'
import { registerSearchHandlers } from './handlers/search.handler'

export function registerIpcHandlers(): void {
  registerTopicsHandlers()
  registerLessonsHandlers()
  registerAttachmentsHandlers()
  registerSearchHandlers()
}
