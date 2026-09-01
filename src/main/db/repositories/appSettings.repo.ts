import { getDb } from '../index'
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../../../shared/types/ai'

// Key-value phang. Value luon la chuoi; kieu hoa o tang goi (getAiSettings).
export function get(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row ? row.value : null
}

export function set(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(key, value)
}

export function getAll(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM app_settings').all() as {
    key: string
    value: string
  }[]
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

// ---- Cai dat AI (gom key rieng le lai thanh 1 object co kieu) ----

const K = {
  ollamaModel: 'ollama_model',
  ollamaPath: 'ollama_path',
  ollamaRefineWithClaude: 'ollama_refine_with_claude',
  ollamaAutoRefine: 'ollama_auto_refine',
  ollamaUseLearnedExamples: 'ollama_use_learned'
} as const

function boolOr(value: string | undefined, fallback: boolean): boolean {
  return value === undefined ? fallback : value === '1'
}

export function getAiSettings(): AiSettings {
  const all = getAll()
  return {
    ollamaModel: all[K.ollamaModel] || DEFAULT_AI_SETTINGS.ollamaModel,
    ollamaPath: all[K.ollamaPath] ?? DEFAULT_AI_SETTINGS.ollamaPath,
    ollamaRefineWithClaude: boolOr(
      all[K.ollamaRefineWithClaude],
      DEFAULT_AI_SETTINGS.ollamaRefineWithClaude
    ),
    ollamaAutoRefine: boolOr(all[K.ollamaAutoRefine], DEFAULT_AI_SETTINGS.ollamaAutoRefine),
    ollamaUseLearnedExamples: boolOr(
      all[K.ollamaUseLearnedExamples],
      DEFAULT_AI_SETTINGS.ollamaUseLearnedExamples
    )
  }
}

export function setAiSettings(patch: Partial<AiSettings>): AiSettings {
  if (patch.ollamaModel !== undefined) set(K.ollamaModel, patch.ollamaModel)
  if (patch.ollamaPath !== undefined) set(K.ollamaPath, patch.ollamaPath)
  if (patch.ollamaRefineWithClaude !== undefined)
    set(K.ollamaRefineWithClaude, patch.ollamaRefineWithClaude ? '1' : '0')
  if (patch.ollamaAutoRefine !== undefined)
    set(K.ollamaAutoRefine, patch.ollamaAutoRefine ? '1' : '0')
  if (patch.ollamaUseLearnedExamples !== undefined)
    set(K.ollamaUseLearnedExamples, patch.ollamaUseLearnedExamples ? '1' : '0')
  return getAiSettings()
}
