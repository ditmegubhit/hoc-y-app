import { registerTopicsHandlers } from './handlers/topics.handler'
import { registerLessonsHandlers } from './handlers/lessons.handler'

export function registerIpcHandlers(): void {
  registerTopicsHandlers()
  registerLessonsHandlers()
}
