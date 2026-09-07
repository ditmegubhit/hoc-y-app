import { describe, it, expect } from 'vitest'
import {
  milestonePercent,
  softCap,
  GEN_END,
  REFINE_END,
  type MilestoneInput
} from './generationPercent'
import type { QuizGenProgress } from '../types/claudeCli'

function gen(partial: Partial<QuizGenProgress>): QuizGenProgress {
  return { phase: 'generating', round: 1, target: 20, kept: 0, ...partial }
}

describe('milestonePercent', () => {
  it('idle = 0, done = 100', () => {
    expect(milestonePercent({ phase: 'idle', progress: null })).toBe(0)
    expect(milestonePercent({ phase: 'done', progress: null })).toBe(100)
  })

  it('dang sinh: theo ti le so cau da gom / target', () => {
    expect(milestonePercent({ phase: 'generating', progress: gen({ kept: 5, target: 20 }) })).toBe(
      0.25 * GEN_END
    )
    expect(milestonePercent({ phase: 'generating', progress: gen({ kept: 20, target: 20 }) })).toBe(
      GEN_END
    )
  })

  it('Ollama: dung so cau dang stream neu lon hon kept', () => {
    const p = gen({ kept: 2, streaming: 8, target: 20 })
    expect(milestonePercent({ phase: 'generating', progress: p })).toBe((8 / 20) * GEN_END)
  })

  it('ra soat: noi suy giua GEN_END va REFINE_END theo lo da xong', () => {
    const p = gen({ phase: 'refining', kept: 20, refineDone: 1, refineTotal: 3 })
    expect(milestonePercent({ phase: 'generating', progress: p })).toBeCloseTo(
      GEN_END + (1 / 3) * (REFINE_END - GEN_END)
    )
  })

  it('ra soat chua co refineTotal: dung o GEN_END', () => {
    const p = gen({ phase: 'refining', kept: 20 })
    expect(milestonePercent({ phase: 'generating', progress: p })).toBe(GEN_END)
  })

  it('saving = REFINE_END', () => {
    expect(milestonePercent({ phase: 'saving', progress: null })).toBe(REFINE_END)
  })

  it('don dieu tang khi kept tang', () => {
    const a = milestonePercent({ phase: 'generating', progress: gen({ kept: 3, target: 20 }) })
    const b = milestonePercent({ phase: 'generating', progress: gen({ kept: 9, target: 20 }) })
    expect(b).toBeGreaterThan(a)
  })

  it('target <= 0 khong chia cho 0', () => {
    expect(milestonePercent({ phase: 'generating', progress: gen({ target: 0, kept: 5 }) })).toBe(0)
  })

  it('kept vuot target van kep o GEN_END', () => {
    expect(
      milestonePercent({ phase: 'generating', progress: gen({ kept: 99, target: 20 }) })
    ).toBe(GEN_END)
  })
})

describe('softCap', () => {
  it('idle/done/saving co gia tri co dinh', () => {
    expect(softCap({ phase: 'idle', progress: null })).toBe(0)
    expect(softCap({ phase: 'saving', progress: null })).toBe(99.5)
    expect(softCap({ phase: 'done', progress: null })).toBe(100)
  })

  it('luon nam GIUA moc that va cuoi chang, va gan moc that', () => {
    const cases: MilestoneInput[] = [
      { phase: 'generating', progress: gen({ kept: 0, target: 20 }) },
      { phase: 'generating', progress: gen({ kept: 12, target: 20 }) },
      { phase: 'generating', progress: gen({ phase: 'refining', refineDone: 1, refineTotal: 3 }) }
    ]
    for (const c of cases) {
      const floor = milestonePercent(c)
      const cap = softCap(c)
      const ceil = c.progress?.phase === 'refining' ? REFINE_END : GEN_END
      expect(cap).toBeGreaterThan(floor)
      expect(cap).toBeLessThanOrEqual(ceil)
      // chi vuot moc that mot phan nho quang duong con lai cua chang
      expect(cap - floor).toBeLessThanOrEqual((ceil - floor) * 0.35 + 1e-9)
    }
  })

  it('khong bao gio cham cuoi chang khi con cach xa', () => {
    // dau chang sinh cau: cap phai con RAT xa GEN_END
    expect(softCap({ phase: 'generating', progress: gen({ kept: 0, target: 20 }) })).toBeLessThan(
      GEN_END * 0.5
    )
    // dau luot ra soat (chua xong lo nao): cap phai con xa REFINE_END
    expect(
      softCap({ phase: 'generating', progress: gen({ phase: 'refining' }) })
    ).toBeLessThan(GEN_END + (REFINE_END - GEN_END) * 0.5)
  })
})
