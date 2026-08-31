export const id = '012_app_settings'

// Bang key-value cho cai dat cap ung dung (khong gan voi bai hoc/chu de nao).
// Dung dau tien cho cau hinh AI provider Ollama (model mac dinh, duong dan,
// bat/tat luot ra soat lai).
export const sql = `
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`
