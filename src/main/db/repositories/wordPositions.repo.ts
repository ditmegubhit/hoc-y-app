import { getDb } from '../index'
import type { ExtractedChunk } from '../../services/textExtraction'

export interface WordPositionRow {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
  coordSpace: 'pdf_point' | 'image_pixel'
  refWidth: number
  refHeight: number
}

// Xoa toan bo row cu cua 1 nguon (source_type+source_id) roi chen lai tu cac
// chunk co du lieu words - cung shape voi replaceSearchIndexEntries, goi
// canh nhau trong extractAndIndex.
export function replaceWordPositions(entry: {
  sourceType: string
  sourceId: string
  chunks: ExtractedChunk[]
}): void {
  const db = getDb()
  const del = db.prepare('DELETE FROM word_positions WHERE source_type = ? AND source_id = ?')
  const ins = db.prepare(
    `INSERT INTO word_positions
      (source_type, source_id, unit_type, unit_index, word_order, text, x0, y0, x1, y1, coord_space, ref_width, ref_height)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  const tx = db.transaction(() => {
    del.run(entry.sourceType, entry.sourceId)
    for (const chunk of entry.chunks) {
      if (!chunk.words || !chunk.coordSpace || chunk.refWidth == null || chunk.refHeight == null) {
        continue
      }
      chunk.words.forEach((word, order) => {
        ins.run(
          entry.sourceType,
          entry.sourceId,
          chunk.unitType,
          chunk.unitIndex,
          order,
          word.text,
          word.bbox.x0,
          word.bbox.y0,
          word.bbox.x1,
          word.bbox.y1,
          chunk.coordSpace,
          chunk.refWidth,
          chunk.refHeight
        )
      })
    }
  })
  tx()
}

interface WordPositionDbRow {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
  coord_space: 'pdf_point' | 'image_pixel'
  ref_width: number
  ref_height: number
}

export function getWordPositions(
  sourceType: string,
  sourceId: string,
  unitType: string,
  unitIndex: number
): WordPositionRow[] {
  const rows = getDb()
    .prepare(
      `SELECT text, x0, y0, x1, y1, coord_space, ref_width, ref_height
       FROM word_positions
       WHERE source_type = ? AND source_id = ? AND unit_type = ? AND unit_index = ?
       ORDER BY word_order`
    )
    .all(sourceType, sourceId, unitType, unitIndex) as WordPositionDbRow[]

  return rows.map((row) => ({
    text: row.text,
    bbox: { x0: row.x0, y0: row.y0, x1: row.x1, y1: row.y1 },
    coordSpace: row.coord_space,
    refWidth: row.ref_width,
    refHeight: row.ref_height
  }))
}

export function deleteWordPositions(sourceType: string, sourceId: string): void {
  getDb()
    .prepare('DELETE FROM word_positions WHERE source_type = ? AND source_id = ?')
    .run(sourceType, sourceId)
}
