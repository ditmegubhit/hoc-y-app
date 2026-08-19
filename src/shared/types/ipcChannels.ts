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
    extractionUpdated: 'attachments:extractionUpdated',
    getPageImage: 'attachments:getPageImage',
    openAtLocation: 'attachments:openAtLocation'
  },
  search: {
    query: 'search:query',
    getHighlightedChunk: 'search:getHighlightedChunk'
  },
  ai: {
    checkAvailability: 'ai:checkAvailability',
    generateQuizFromLesson: 'ai:generateQuizFromLesson',
    saveDraftQuestions: 'ai:saveDraftQuestions',
    listQuestionsByLesson: 'ai:listQuestionsByLesson',
    deleteQuestion: 'ai:deleteQuestion'
  },
  questionBank: {
    countAll: 'questionBank:countAll'
  },
  examFiles: {
    list: 'examFiles:list',
    add: 'examFiles:add',
    remove: 'examFiles:remove'
  }
} as const
