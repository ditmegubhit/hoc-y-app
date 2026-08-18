export const IpcChannels = {
  topics: {
    list: 'topics:list',
    create: 'topics:create',
    update: 'topics:update',
    delete: 'topics:delete'
  },
  lessons: {
    listAll: 'lessons:listAll',
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
  }
} as const
