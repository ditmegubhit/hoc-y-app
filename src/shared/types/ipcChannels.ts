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
    extractionUpdated: 'attachments:extractionUpdated'
  },
  search: {
    query: 'search:query'
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
  }
} as const
