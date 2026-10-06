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
import type {
  AnatomyAttemptReview,
  AnatomyAttemptSummary,
  AnatomyQuestionSummary,
  AnatomyStationSet,
  AnatomyEligibility,
  AnatomyLabelCandidate,
  AnatomyTextReading,
  ConfirmAnatomyCandidateInput,
  CreateAnatomyStationSetInput,
  CreateManualCandidateInput,
  SaveAnatomyAttemptProgressInput,
  StartAnatomyAttemptInput,
  StartedAnatomyAttempt,
  SubmitAnatomyAttemptInput,
  UpdateAnatomyCandidateInput,
  UpdateQuestionAnswerInput
} from './anatomyQuiz'
import type {
  CheckPracticeAnswerInput,
  CreatePracticeFolderInput,
  CreatePracticeRegionInput,
  CreatePracticeStationSetInput,
  MovePracticeNodeInput,
  PickRandomPracticeQuestionsInput,
  PracticeAddFilesResult,
  PracticeAiPageReading,
  PracticeAttemptReview,
  PracticeAttemptSummary,
  PracticeFile,
  PracticePageState,
  PracticeQuestionSummary,
  PracticeRegion,
  PracticeScanProgress,
  PracticeScanResult,
  PracticeScanState,
  PracticeSearchResult,
  PracticeSourceStatus,
  PracticeStationSet,
  PracticeTextReading,
  PracticeTreeNode,
  RenamePracticeNodeInput,
  ResetPracticeRegionColorsInput,
  SavePracticeAttemptProgressInput,
  SetPracticePageReviewInput,
  StartedPracticeAttempt,
  StartPracticeAttemptInput,
  SubmitPracticeAttemptInput,
  UpdatePracticeFileSettingsInput,
  UpdatePracticeRegionInput
} from './practice'

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
    add: (lessonId: string) => Promise<Attachment[]>
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
  anatomy: {
    readCandidateText: (candidateId: string) => Promise<AnatomyTextReading>
    detectPage: (input: { attachmentId: string; pageNumber: number }) => Promise<AnatomyLabelCandidate[]>
    detectAllPages: (input: { attachmentId: string; force?: boolean }) => Promise<{ totalPages: number; cancelled?: boolean; alreadyComplete?: boolean }>
    cancelDetectAllPages: (attachmentId: string) => Promise<void>
    onDetectAllPagesProgress: (
      callback: (payload: { pageNumber: number; totalPages: number }) => void
    ) => () => void
    listCandidatesForPage: (input: {
      attachmentId: string
      pageNumber: number
    }) => Promise<AnatomyLabelCandidate[]>
    updateCandidate: (input: UpdateAnatomyCandidateInput) => Promise<void>
    createManualCandidate: (input: CreateManualCandidateInput) => Promise<string>
    confirmCandidate: (input: ConfirmAnatomyCandidateInput) => Promise<string>
    updateQuestionAnswer: (input: UpdateQuestionAnswerInput) => Promise<void>
    rejectCandidate: (candidateId: string) => Promise<void>
    deleteCandidate: (candidateId: string) => Promise<void>
    countConfirmedForAttachment: (attachmentId: string) => Promise<number>
    listQuestionSummaries: (attachmentId: string) => Promise<AnatomyQuestionSummary[]>
    listStationSets: (attachmentId: string) => Promise<AnatomyStationSet[]>
    createStationSet: (input: CreateAnatomyStationSetInput) => Promise<AnatomyStationSet>
    deleteStationSet: (stationSetId: string) => Promise<void>
    saveAttemptProgress: (input: SaveAnatomyAttemptProgressInput) => Promise<void>
    resumeAttempt: (attemptId: string) => Promise<StartedAnatomyAttempt | null>
    getEligibility: (attachmentId: string) => Promise<AnatomyEligibility>
    resolveSourceChange: (input: { attachmentId: string; isSimilar: boolean }) => Promise<void>
    setPageReview: (input: { attachmentId: string; pageNumber: number; reviewed?: boolean; excluded?: boolean }) => Promise<void>
    getPageReview: (input: { attachmentId: string; pageNumber: number }) => Promise<{ reviewed: boolean; excluded: boolean }>
    checkAnswer: (input: {
      questionId: string
      submittedText: string
    }) => Promise<{ isCorrect: boolean; correctAnswerText: string }>
    startAttempt: (input: StartAnatomyAttemptInput) => Promise<StartedAnatomyAttempt>
    submitAttempt: (input: SubmitAnatomyAttemptInput) => Promise<AnatomyAttemptReview>
    getAttemptReview: (attemptId: string) => Promise<AnatomyAttemptReview | null>
    listAttemptHistory: (attachmentId: string) => Promise<AnatomyAttemptSummary[]>
    deleteAttemptHistory: (attemptId: string) => Promise<void>
  }
  // Khu "Thuc hanh Giai phau" - mo ta chi tiet o dau shared/types/practice.ts
  practice: {
    /** Duong dan that cua File keo-tha tu Explorer (Electron khong con File.path). */
    getPathForFile: (file: File) => string
    listNodes: () => Promise<PracticeTreeNode[]>
    createFolder: (input: CreatePracticeFolderInput) => Promise<PracticeTreeNode>
    renameNode: (input: RenamePracticeNodeInput) => Promise<PracticeTreeNode>
    moveNode: (input: MovePracticeNodeInput) => Promise<PracticeTreeNode>
    deleteNode: (id: string) => Promise<void>
    search: (keyword: string) => Promise<PracticeSearchResult[]>
    pickAndAddFiles: (parentId: string | null) => Promise<PracticeAddFilesResult>
    addFilesFromPaths: (parentId: string | null, paths: string[]) => Promise<PracticeAddFilesResult>
    getFile: (fileId: string) => Promise<PracticeFile | null>
    updateFileSettings: (input: UpdatePracticeFileSettingsInput) => Promise<PracticeFile>
    resetRegionColors: (input: ResetPracticeRegionColorsInput) => Promise<number>
    getSourceStatus: (fileId: string) => Promise<PracticeSourceStatus>
    syncSource: (fileId: string) => Promise<boolean>
    resolveSourceChange: (input: { fileId: string; isSimilar: boolean }) => Promise<void>
    onFilesUpdated: (callback: (fileId: string) => void) => () => void
    scanFile: (input: { fileId: string; force?: boolean }) => Promise<PracticeScanResult>
    cancelScan: (fileId: string) => Promise<void>
    getScanState: (fileId: string) => Promise<PracticeScanState | null>
    onScanProgress: (callback: (progress: PracticeScanProgress) => void) => () => void
    listRegionsForPage: (input: { fileId: string; pageNumber: number }) => Promise<PracticeRegion[]>
    listRegionsForFile: (fileId: string) => Promise<PracticeRegion[]>
    createRegion: (input: CreatePracticeRegionInput) => Promise<PracticeRegion>
    updateRegion: (input: UpdatePracticeRegionInput) => Promise<PracticeRegion>
    deleteRegion: (id: string) => Promise<void>
    restoreRegion: (region: PracticeRegion) => Promise<PracticeRegion>
    readRegionWithAi: (regionId: string) => Promise<PracticeTextReading>
    readPageWithAi: (input: { fileId: string; pageNumber: number }) => Promise<PracticeAiPageReading[]>
    listPageStates: (fileId: string) => Promise<PracticePageState[]>
    setPageReview: (input: SetPracticePageReviewInput) => Promise<void>
    listQuestionSummaries: (fileId: string) => Promise<PracticeQuestionSummary[]>
    pickRandomQuestions: (input: PickRandomPracticeQuestionsInput) => Promise<string[]>
    listStationSets: (fileId: string) => Promise<PracticeStationSet[]>
    createStationSet: (input: CreatePracticeStationSetInput) => Promise<PracticeStationSet>
    deleteStationSet: (stationSetId: string) => Promise<void>
    startAttempt: (input: StartPracticeAttemptInput) => Promise<StartedPracticeAttempt>
    saveAttemptProgress: (input: SavePracticeAttemptProgressInput) => Promise<void>
    resumeAttempt: (attemptId: string) => Promise<StartedPracticeAttempt | null>
    findActiveAttempt: (fileId: string) => Promise<string | null>
    checkAnswer: (input: CheckPracticeAnswerInput) => Promise<{ isCorrect: boolean; correctAnswerText: string }>
    submitAttempt: (input: SubmitPracticeAttemptInput) => Promise<PracticeAttemptReview>
    getAttemptReview: (attemptId: string) => Promise<PracticeAttemptReview | null>
    listAttemptHistory: (fileId: string) => Promise<PracticeAttemptSummary[]>
    deleteAttemptHistory: (attemptId: string) => Promise<void>
    createReviewSet: (attemptId: string) => Promise<PracticeStationSet>
  }
}
