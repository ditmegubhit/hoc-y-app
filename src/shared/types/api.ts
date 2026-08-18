import type { Topic, CreateTopicInput, UpdateTopicInput } from './topic'
import type { Lesson, LessonSummary, CreateLessonInput, UpdateLessonInput } from './lesson'

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
}
