import { getDb } from '../index'
import type { SearchSourceType } from '../../../shared/types/search'

// Xoa toan bo row cu cua 1 nguon (source_type+source_id) roi chen lai theo
// tung don vi (trang/slide/toan van ban/ghi chu) - 1 nguon co the co NHIEU
// row (vd 1 file PDF nhieu trang = nhieu row), de biet chinh xac tu khoa
// nam o don vi nao thay vi chi biet "co trong file nay o dau do".
export function replaceSearchIndexEntries(entry: {
  sourceType: SearchSourceType
  sourceId: string
  lessonId: string
  topicId: string
  title: string
  chunks: { unitType: string; unitIndex: number; text: string }[]
}): void {
  const db = getDb()
  const del = db.prepare('DELETE FROM search_index WHERE source_type = ? AND source_id = ?')
  const ins = db.prepare(
    `INSERT INTO search_index (title, content, lesson_id, topic_id, source_type, source_id, unit_type, unit_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )

  const tx = db.transaction(() => {
    del.run(entry.sourceType, entry.sourceId)
    for (const chunk of entry.chunks) {
      if (!chunk.text.trim()) continue
      ins.run(
        entry.title,
        chunk.text,
        entry.lessonId,
        entry.topicId,
        entry.sourceType,
        entry.sourceId,
        chunk.unitType,
        chunk.unitIndex
      )
    }
  })
  tx()
}

export function deleteSearchIndex(sourceType: SearchSourceType, sourceId: string): void {
  getDb()
    .prepare('DELETE FROM search_index WHERE source_type = ? AND source_id = ?')
    .run(sourceType, sourceId)
}

export function deleteSearchIndexByLesson(lessonId: string): void {
  getDb().prepare('DELETE FROM search_index WHERE lesson_id = ?').run(lessonId)
}
