import * as m001 from './001_topics_lessons'
import * as m002 from './002_attachments_search'

export interface Migration {
  id: string
  sql: string
}

// Them migration moi cho tung milestone bang cach import va push vao day,
// giu nguyen thu tu, khong sua lai migration cu da chay.
export const migrations: Migration[] = [m001, m002]
