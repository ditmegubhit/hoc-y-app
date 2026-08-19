export type SearchSourceType = 'lesson_note' | 'attachment'

export interface SearchResultItem {
  sourceType: SearchSourceType
  sourceId: string
  lessonId: string
  lessonTitle: string
  snippet: string
  unitType: string
  unitIndex: number
}

export interface SearchResultGroup {
  topicId: string
  topicName: string
  items: SearchResultItem[]
}

export interface HighlightedChunkQuery {
  sourceType: SearchSourceType
  sourceId: string
  unitType: string
  unitIndex: number
  keyword: string
}

export interface HighlightedChunk {
  unitType: string
  unitIndex: number
  highlighted: string
}
