export type SearchSourceType = 'lesson_note' | 'attachment'

export interface SearchResultItem {
  sourceType: SearchSourceType
  sourceId: string
  lessonId: string
  lessonTitle: string
  snippet: string
}

export interface SearchResultGroup {
  topicId: string
  topicName: string
  items: SearchResultItem[]
}
