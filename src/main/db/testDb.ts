import Database from 'better-sqlite3'
import { migrations } from './migrations'

// Chi dung trong test: DB :memory: da chay het migration, bat foreign_keys giong db that.
export function createMigratedMemoryDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  for (const migration of migrations) db.exec(migration.sql)
  return db
}
