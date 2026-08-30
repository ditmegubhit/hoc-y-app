import { registerTopicsHandlers } from './handlers/topics.handler'
import { registerLessonsHandlers } from './handlers/lessons.handler'
import { registerAttachmentsHandlers } from './handlers/attachments.handler'
import { registerSearchHandlers } from './handlers/search.handler'
import { registerAiHandlers } from './handlers/ai.handler'
import { registerQuizHandlers } from './handlers/quiz.handler'
import { registerQuestionBankHandlers } from './handlers/questionBank.handler'
import { registerExamFilesHandlers } from './handlers/examFiles.handler'
import { registerNotesHandlers } from './handlers/notes.handler'

export function registerIpcHandlers(): void {
  registerTopicsHandlers()
  registerLessonsHandlers()
  registerAttachmentsHandlers()
  registerSearchHandlers()
  registerAiHandlers()
  registerQuizHandlers()
  registerQuestionBankHandlers()
  registerExamFilesHandlers()
  registerNotesHandlers()
}
