import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'
import { migrations } from './migrations'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'hoc-y-app.sqlite3')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)
  return db
}

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const appliedRows = database.prepare('SELECT id FROM schema_migrations').all() as {
    id: string
  }[]
  const applied = new Set(appliedRows.map((r) => r.id))

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue

    const runOne = database.transaction(() => {
      database.exec(migration.sql)
      database.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(migration.id)
    })
    runOne()
    console.log(`[db] applied migration: ${migration.id}`)
  }
}
