import { create } from 'zustand'
import type { QuizGenProgress } from '@shared/types/claudeCli'

// Trang thai soan cau hoi bang AI, tach rieng theo tung pham vi (bai hoc / chu
// de) - de bam Soan o bai A roi chuyen sang bai B thi B khong bi hien "Dang
// soan", va cau soan xong luu dung vao bai A. Sinh + luu chay ngoai vong doi
// component nen khong phu thuoc bai nao dang mo.

export type GenPhase = 'idle' | 'generating' | 'saving'

export interface GenOutcome {
  savedCount: number
  duplicates: number
  truncated: boolean
  shortfall: number
  error: string | null
}

interface QuizGenerationState {
  phase: Record<string, GenPhase>
  outcome: Record<string, GenOutcome | null>
  // Tien do chi tiet tu main (theo vong / streaming). null khi khong soan.
  progress: Record<string, QuizGenProgress | null>
  setPhase: (key: string, phase: GenPhase) => void
  setOutcome: (key: string, outcome: GenOutcome | null) => void
  setProgress: (key: string, progress: QuizGenProgress | null) => void
}

export const useQuizGenerationStore = create<QuizGenerationState>((set) => ({
  phase: {},
  outcome: {},
  progress: {},
  setPhase: (key, phase) => set((s) => ({ phase: { ...s.phase, [key]: phase } })),
  setOutcome: (key, outcome) => set((s) => ({ outcome: { ...s.outcome, [key]: outcome } })),
  setProgress: (key, progress) => set((s) => ({ progress: { ...s.progress, [key]: progress } }))
}))
