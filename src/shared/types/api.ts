import type { Topic, CreateTopicInput, UpdateTopicInput } from './topic'
import type {
  Lesson,
  LessonSummary,
  RecentLesson,
  CreateLessonInput,
  UpdateLessonInput
} from './lesson'
import type { Attachment } from './attachment'
import type { Annotation, NewAnnotation } from './annotation'
import type { SearchResultGroup, HighlightedChunkQuery, HighlightedChunk } from './search'
import type {
  DraftQuestion,
  Question,
  UpdateQuestionInput,
  ReviewedQuestion,
  LearningExampleInput
} from './question'
import type {
  ClaudeCliStatus,
  GenerateQuizFromLessonResult,
  QuizGenProgress
} from './claudeCli'
import type { AiProvider, AiSettings, OllamaStatus } from './ai'
import type { ExamFile } from './examFile'
import type {
  AttemptReview,
  CreatedQuiz,
  CreateQuizInput,
  QuizAttemptSummary,
  SubmitAttemptInput
} from './quiz'

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
    listRecent: (limit: number) => Promise<RecentLesson[]>
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
    linkSource: (id: string) => Promise<Attachment | null>
    bulkLinkSources: () => Promise<{ total: number; matched: number; ambiguous: number } | null>
    onExtractionUpdated: (callback: (attachmentId: string) => void) => () => void
    getPageImage: (input: {
      attachmentId: string
      unitType: string
      unitIndex: number
    }) => Promise<{ mimeType: string; base64: string } | null>
    getPageCount: (input: { attachmentId: string }) => Promise<number | null>
    openAtLocation: (input: {
      attachmentId: string
      unitType: string
      unitIndex: number
      matchedText: string
    }) => Promise<{ success: boolean; message?: string }>
    getAnnotations: (input: { attachmentId: string }) => Promise<Annotation[]>
    saveAnnotations: (input: {
      attachmentId: string
      annotations: NewAnnotation[]
    }) => Promise<void>
  }
  search: {
    query: (keyword: string) => Promise<SearchResultGroup[]>
    getHighlightedChunk: (query: HighlightedChunkQuery) => Promise<HighlightedChunk | null>
  }
  ai: {
    checkAvailability: () => Promise<ClaudeCliStatus>
    checkOllama: () => Promise<OllamaStatus>
    getAiSettings: () => Promise<AiSettings>
    setAiSettings: (patch: Partial<AiSettings>) => Promise<AiSettings>
    generateQuizFromLesson: (input: {
      lessonId: string
      numQuestions: number
      provider: AiProvider
      refineWithClaude?: boolean
      progressKey?: string
    }) => Promise<GenerateQuizFromLessonResult>
    generateQuizFromLessons: (input: {
      lessonIds: string[]
      numQuestions: number
      topicId?: string | null
      provider: AiProvider
      refineWithClaude?: boolean
      progressKey?: string
    }) => Promise<GenerateQuizFromLessonResult>
    onGenerateProgress: (callback: (progress: QuizGenProgress) => void) => () => void
    saveDraftQuestions: (input: {
      questions: DraftQuestion[]
      lessonId?: string | null
      topicId?: string | null
      provider: AiProvider
    }) => Promise<Question[]>
    listQuestionsByLesson: (lessonId: string) => Promise<Question[]>
    listQuestionsByLessonIds: (lessonIds: string[]) => Promise<Question[]>
    listQuestionsByTopic: (topicId: string) => Promise<Question[]>
    listQuestionsUnderTopic: (topicId: string) => Promise<Question[]>
    updateQuestion: (input: UpdateQuestionInput) => Promise<Question>
    reviewQuestions: (input: {
      questionIds: string[]
      provider: AiProvider
    }) => Promise<ReviewedQuestion[]>
    recordLearningExamples: (examples: LearningExampleInput[]) => Promise<void>
    deleteQuestion: (id: string) => Promise<void>
  }
  quiz: {
    listPlayableForLesson: (lessonId: string) => Promise<Question[]>
    listPlayableForTopic: (input: {
      topicId: string
      lessonIds: string[]
    }) => Promise<Question[]>
    create: (input: CreateQuizInput) => Promise<CreatedQuiz>
    submitAttempt: (input: SubmitAttemptInput) => Promise<AttemptReview>
    listAttemptsByLesson: (lessonId: string) => Promise<QuizAttemptSummary[]>
    listAttemptsByTopic: (topicId: string) => Promise<QuizAttemptSummary[]>
    getAttemptReview: (attemptId: string) => Promise<AttemptReview | null>
    deleteAttempt: (attemptId: string) => Promise<void>
  }
  questionBank: {
    countAll: () => Promise<number>
  }
  examFiles: {
    list: () => Promise<ExamFile[]>
    add: () => Promise<ExamFile | null>
    remove: (id: string) => Promise<void>
  }
  notes: {
    pickImage: () => Promise<{ mimeType: string; base64: string } | null>
  }
}
