import type { QuizGenProgress } from '../types/claudeCli'

// Phan tram "toan bo cong viec" soan cau hoi bang AI. Renderer khong co tin hieu
// tien do lien tuc (su kien QuizGenProgress chi ban theo moc roi rac) nen chia
// cong viec thanh 3 chang co trong so, roi phia renderer ease tiem can giua cac
// su kien de con so nhich lien tuc.

// idle: chua chay. generating: dang sinh/ra soat (dung `progress` de biet chi
// tiet). saving: dang luu vao DB. done: xong het.
export type GenDisplayPhase = 'idle' | 'generating' | 'saving' | 'done'

// Ranh gioi cac chang tren thang 0..100.
export const GEN_END = 72 // sinh du cau: 0 -> 72
export const REFINE_END = 96 // ra soat: 72 -> 96
// luu: 96 -> 100

export interface MilestoneInput {
  phase: GenDisplayPhase
  progress: QuizGenProgress | null
}

function clamp01(x: number): number {
  if (!Number.isFinite(x) || x < 0) return 0
  return x > 1 ? 1 : x
}

/**
 * Moc tien do THAT (0..100) suy tu su kien moi nhat. Phia goi chiu trach nhiem
 * giu don dieu tang (khong dung moc nay lam tut con so hien thi).
 */
export function milestonePercent({ phase, progress }: MilestoneInput): number {
  if (phase === 'idle') return 0
  if (phase === 'done') return 100
  if (phase === 'saving') return REFINE_END

  // phase === 'generating' -> lay chi tiet tu `progress`
  if (!progress || progress.target <= 0) return 0

  if (progress.phase === 'refining') {
    const r =
      progress.refineTotal && progress.refineTotal > 0
        ? clamp01((progress.refineDone ?? 0) / progress.refineTotal)
        : 0
    return GEN_END + r * (REFINE_END - GEN_END)
  }

  // 'generating' | 'topping_up': theo so cau da gom (Ollama: cong them so cau
  // dang stream trong vong hien tai).
  const gathered = clamp01(Math.max(progress.kept, progress.streaming ?? 0) / progress.target)
  return gathered * GEN_END
}

// Tran chi vuot moc that mot quang ngan (~LEAD cua phan con lai trong chang hien
// tai). Nho vay con so bam sat tien do that: no "ri ri" nhich len mot chut roi
// cho su kien that keo len tiep, thay vi phi thang toi cuoi chang va dung im o
// do suot ca phut (72% / 96%).
const LEAD = 0.3

function phaseCeiling({ phase, progress }: MilestoneInput): number {
  if (phase === 'saving') return 100
  if (progress?.phase === 'refining') return REFINE_END
  return GEN_END
}

/**
 * Tran de con so hien thi "ri ri" tien toi giua 2 su kien that - luon nam ngay
 * tren moc that mot chut, khong bao gio cham cuoi chang som.
 */
export function softCap(input: MilestoneInput): number {
  if (input.phase === 'idle') return 0
  if (input.phase === 'done') return 100
  if (input.phase === 'saving') return 99.5
  const floor = milestonePercent(input)
  const ceil = phaseCeiling(input)
  return floor + (ceil - floor) * LEAD
}
