import * as m001 from './001_topics_lessons'
import * as m002 from './002_attachments_search'
import * as m003 from './003_question_bank_quiz'
import * as m004 from './004_exam_files_status'
import * as m005 from './005_ocr_extraction_status'
import * as m006 from './006_search_index_units'
import * as m007 from './007_word_positions'
import * as m008 from './008_docx_page_split'
import * as m009 from './009_attachment_annotations'
import * as m010 from './010_quiz_m6'
import * as m011 from './011_attachment_source'
import * as m012 from './012_app_settings'
import * as m013 from './013_quiz_learning'

export interface Migration {
  id: string
  sql: string
}

// Them migration moi cho tung milestone bang cach import va push vao day,
// giu nguyen thu tu, khong sua lai migration cu da chay.
export const migrations: Migration[] = [
  m001,
  m002,
  m003,
  m004,
  m005,
  m006,
  m007,
  m008,
  m009,
  m010,
  m011,
  m012,
  m013
]
