export const id = '021_anatomy_source_confirmation'

export const sql = `
ALTER TABLE anatomy_attachment_eligibility ADD COLUMN needs_source_confirmation INTEGER NOT NULL DEFAULT 0;
`
