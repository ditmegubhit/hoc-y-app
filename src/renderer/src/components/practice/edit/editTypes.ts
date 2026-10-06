// Kieu dung chung cho man "Sua dap an" (thu muc components/practice/edit).

export type EditMode = 'sequence' | 'select'

// select = chon/di chuyen/doi co; draw = ve vung moi; crop = ve khung crop cho vung dang chon.
export type EditTool = 'select' | 'draw' | 'crop'

export interface SequenceStats {
  confirmed: number
  maskOnly: number
  deleted: number
  skipped: number
}

export const EMPTY_STATS: SequenceStats = { confirmed: 0, maskOnly: 0, deleted: 0, skipped: 0 }

export interface EditNotice {
  kind: 'error' | 'info'
  text: string
}
