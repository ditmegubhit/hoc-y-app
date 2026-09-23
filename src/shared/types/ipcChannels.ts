export const IpcChannels = {
  topics: {
    list: 'topics:list',
    create: 'topics:create',
    update: 'topics:update',
    delete: 'topics:delete'
  },
  lessons: {
    listAll: 'lessons:listAll',
    listRecent: 'lessons:listRecent',
    get: 'lessons:get',
    create: 'lessons:create',
    update: 'lessons:update',
    delete: 'lessons:delete'
  },
  attachments: {
    listByLesson: 'attachments:listByLesson',
    add: 'attachments:add',
    remove: 'attachments:remove',
    reextract: 'attachments:reextract',
    linkSource: 'attachments:linkSource',
    bulkLinkSources: 'attachments:bulkLinkSources',
    extractionUpdated: 'attachments:extractionUpdated',
    getPageImage: 'attachments:getPageImage',
    getPageCount: 'attachments:getPageCount',
    openAtLocation: 'attachments:openAtLocation',
    getAnnotations: 'attachments:getAnnotations',
    saveAnnotations: 'attachments:saveAnnotations'
  },
  search: {
    query: 'search:query',
    getHighlightedChunk: 'search:getHighlightedChunk'
  },
  ai: {
    checkAvailability: 'ai:checkAvailability',
    checkOllama: 'ai:checkOllama',
    getAiSettings: 'ai:getAiSettings',
    setAiSettings: 'ai:setAiSettings',
    generateQuizFromLesson: 'ai:generateQuizFromLesson',
    generateQuizFromLessons: 'ai:generateQuizFromLessons',
    generateProgress: 'ai:generateProgress',
    saveDraftQuestions: 'ai:saveDraftQuestions',
    listQuestionsByLesson: 'ai:listQuestionsByLesson',
    listQuestionsByLessonIds: 'ai:listQuestionsByLessonIds',
    listQuestionsByTopic: 'ai:listQuestionsByTopic',
    listQuestionsUnderTopic: 'ai:listQuestionsUnderTopic',
    updateQuestion: 'ai:updateQuestion',
    reviewQuestions: 'ai:reviewQuestions',
    recordLearningExamples: 'ai:recordLearningExamples',
    deleteQuestion: 'ai:deleteQuestion'
  },
  quiz: {
    listPlayableForLesson: 'quiz:listPlayableForLesson',
    listPlayableForTopic: 'quiz:listPlayableForTopic',
    create: 'quiz:create',
    submitAttempt: 'quiz:submitAttempt',
    listAttemptsByLesson: 'quiz:listAttemptsByLesson',
    listAttemptsByTopic: 'quiz:listAttemptsByTopic',
    getAttemptReview: 'quiz:getAttemptReview',
    deleteAttempt: 'quiz:deleteAttempt'
  },
  questionBank: {
    countAll: 'questionBank:countAll'
  },
  examFiles: {
    list: 'examFiles:list',
    add: 'examFiles:add',
    remove: 'examFiles:remove'
  },
  notes: {
    pickImage: 'notes:pickImage'
  },
  anatomy: {
    detectPage: 'anatomy:detectPage',
    detectAllPages: 'anatomy:detectAllPages',
    detectAllPagesProgress: 'anatomy:detectAllPagesProgress',
    cancelDetectAllPages: 'anatomy:cancelDetectAllPages',
    listCandidatesForPage: 'anatomy:listCandidatesForPage',
    updateCandidate: 'anatomy:updateCandidate',
    createManualCandidate: 'anatomy:createManualCandidate',
    confirmCandidate: 'anatomy:confirmCandidate',
    updateQuestionAnswer: 'anatomy:updateQuestionAnswer',
    rejectCandidate: 'anatomy:rejectCandidate',
    deleteCandidate: 'anatomy:deleteCandidate',
    countConfirmedForAttachment: 'anatomy:countConfirmedForAttachment',
    listQuestionSummaries: 'anatomy:listQuestionSummaries',
    listStationSets: 'anatomy:listStationSets',
    createStationSet: 'anatomy:createStationSet',
    deleteStationSet: 'anatomy:deleteStationSet',
    saveAttemptProgress: 'anatomy:saveAttemptProgress',
    resumeAttempt: 'anatomy:resumeAttempt',
    getEligibility: 'anatomy:getEligibility',
    resolveSourceChange: 'anatomy:resolveSourceChange',
    setPageReview: 'anatomy:setPageReview',
    getPageReview: 'anatomy:getPageReview',
    checkAnswer: 'anatomy:checkAnswer',
    startAttempt: 'anatomy:startAttempt',
    submitAttempt: 'anatomy:submitAttempt',
    getAttemptReview: 'anatomy:getAttemptReview',
    listAttemptHistory: 'anatomy:listAttemptHistory',
    deleteAttemptHistory: 'anatomy:deleteAttemptHistory'
  }
} as const
