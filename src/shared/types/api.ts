import type { Topic, CreateTopicInput, UpdateTopicInput } from './topic'
import type { Lesson, LessonSummary, CreateLessonInput, UpdateLessonInput } from './lesson'
import type { Attachment } from './attachment'
import type { SearchResultGroup } from './search'
import type { DraftQuestion, Question } from './question'
import type { ClaudeCliStatus, GenerateQuizFromLessonResult } from './claudeCli'

export interface AppApi {
  appVersion: string
  topics: {
    list: () => Promise<Topic[]>
    create: (input: CreateTopicInput) => Promise<Topic>
    update: (input: UpdateTopicInput) => Promise<Topic>
    delete: (id: string) => Promise<void>
  }
  lessons: {
    listAll: () => Promise<LessonSummary[]>
    get: (id: string) => Promise<Lesson | null>
    create: (input: CreateLessonInput) => Promise<Lesson>
    update: (input: UpdateLessonInput) => Promise<Lesson>
    delete: (id: string) => Promise<void>
  }
  attachments: {
    listByLesson: (lessonId: string) => Promise<Attachment[]>
    add: (lessonId: string) => Promise<Attachment | null>
    remove: (id: string) => Promise<void>
    reextract: (id: string) => Promise<void>
    onExtractionUpdated: (callback: (attachmentId: string) => void) => () => void
  }
  search: {
    query: (keyword: string) => Promise<SearchResultGroup[]>
  }
  ai: {
    checkAvailability: () => Promise<ClaudeCliStatus>
    generateQuizFromLesson: (input: {
      lessonId: string
      numQuestions: number
    }) => Promise<GenerateQuizFromLessonResult>
    saveDraftQuestions: (input: {
      lessonId: string
      questions: DraftQuestion[]
    }) => Promise<Question[]>
    listQuestionsByLesson: (lessonId: string) => Promise<Question[]>
    deleteQuestion: (id: string) => Promise<void>
  }
}
