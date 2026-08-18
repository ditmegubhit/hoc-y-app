import { getDb } from '../db'
import type { SearchResultGroup, SearchSourceType } from '../../shared/types/search'

// FTS5 MATCH khong nhan an toan cac ky tu dac biet (", *, ^, :, ...) trong tu khoa tho.
// Boc tung tu trong dau ngoac kep va noi bang AND de tim day du tat ca cac tu,
// tranh loi cu phap FTS query nang cao ma nguoi dung khong co y dinh dung.
function buildMatchQuery(rawKeyword: string): string {
  return rawKeyword
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(' AND ')
}

interface SearchRow {
  sourceType: SearchSourceType
  sourceId: string
  lessonId: string
  topicId: string
  lessonTitle: string
  topicName: string
  snippet: string
}

export function searchAll(rawKeyword: string): SearchResultGroup[] {
  const keyword = rawKeyword.trim()
  if (!keyword) return []

  const matchQuery = buildMatchQuery(keyword)
  if (!matchQuery) return []

  const rows = getDb()
    .prepare(
      `SELECT
         si.source_type as sourceType,
         si.source_id as sourceId,
         si.lesson_id as lessonId,
         si.topic_id as topicId,
         l.title as lessonTitle,
         t.name as topicName,
         snippet(search_index, 1, '[', ']', '…', 12) as snippet
       FROM search_index si
       JOIN lessons l ON l.id = si.lesson_id
       JOIN topics t ON t.id = si.topic_id
       WHERE search_index MATCH ?
       ORDER BY t.name, l.title`
    )
    .all(matchQuery) as SearchRow[]

  const groups = new Map<string, SearchResultGroup>()
  for (const row of rows) {
    let group = groups.get(row.topicId)
    if (!group) {
      group = { topicId: row.topicId, topicName: row.topicName, items: [] }
      groups.set(row.topicId, group)
    }
    group.items.push({
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      lessonId: row.lessonId,
      lessonTitle: row.lessonTitle,
      snippet: row.snippet
    })
  }

  return Array.from(groups.values())
}
