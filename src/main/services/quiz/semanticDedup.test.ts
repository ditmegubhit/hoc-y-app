import { describe, it, expect } from 'vitest'
import {
  stripDiacritics,
  contentTokens,
  diceCoefficient,
  cosineSimilarity,
  lexicalSimilarity,
  filterSemanticDuplicates
} from './semanticDedup'
import type { DraftQuestion } from '../../../shared/types/question'

function q(text: string): DraftQuestion {
  return {
    questionText: text,
    options: [
      { id: 'a', text: 'A', isCorrect: true },
      { id: 'b', text: 'B', isCorrect: false },
      { id: 'c', text: 'C', isCorrect: false },
      { id: 'd', text: 'D', isCorrect: false }
    ],
    explanation: null
  }
}

describe('stripDiacritics', () => {
  it('bo dau tieng Viet va chuyen d', () => {
    expect(stripDiacritics('Phế nang đường huyết')).toBe('Phe nang duong huyet')
  })
})

describe('contentTokens', () => {
  it('bo stopword va tu ngan', () => {
    expect(contentTokens('Chức năng chính của phế nang là gì')).toEqual([
      'chuc',
      'nang',
      'phe',
      'nang'
    ])
  })
})

describe('diceCoefficient', () => {
  it('1.0 khi giong het', () => {
    expect(diceCoefficient('phế nang', 'phế nang')).toBeCloseTo(1)
  })
  it('cao khi chi khac dau', () => {
    expect(diceCoefficient('phế nang', 'phe nang')).toBeGreaterThan(0.9)
  })
  it('thap khi khac han', () => {
    expect(diceCoefficient('phế nang', 'cầu thận')).toBeLessThan(0.3)
  })
})

describe('cosineSimilarity', () => {
  it('1 khi cung huong', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
  })
  it('0 khi truc giao', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
  })
})

describe('lexicalSimilarity', () => {
  it('bat cau dao trat tu tu / viet lai gan giong', () => {
    expect(
      lexicalSimilarity('Chức năng chính của phế nang là gì?', 'Phế nang có chức năng gì?')
    ).toBeGreaterThan(0.72)
    expect(
      lexicalSimilarity(
        'Van hai lá ngăn giữa hai buồng tim nào?',
        'Van hai lá nằm giữa hai buồng tim nào?'
      )
    ).toBeGreaterThan(0.72)
  })

  it('phan biet 2 cau khac chu de', () => {
    expect(
      lexicalSimilarity('Phế nang có chức năng gì?', 'Cầu thận lọc chất nào đầu tiên?')
    ).toBeLessThan(0.4)
  })
})

describe('filterSemanticDuplicates (JS thuan)', () => {
  it('bo cau trung y voi ngan hang hien co', async () => {
    const res = await filterSemanticDuplicates(
      [q('Phế nang có chức năng gì?'), q('Đơn vị lọc của thận tên là gì?')],
      ['Chức năng chính của phế nang là gì?']
    )
    expect(res.kept).toHaveLength(1)
    expect(res.kept[0].questionText).toContain('thận')
    expect(res.removed).toBe(1)
  })

  it('bo cau trung y trong cung batch', async () => {
    const res = await filterSemanticDuplicates(
      [
        q('Van hai lá ngăn giữa hai buồng tim nào?'),
        q('Van hai lá nằm giữa hai buồng tim nào?')
      ],
      []
    )
    expect(res.kept).toHaveLength(1)
  })

  it('giu lai khi khong trung', async () => {
    const res = await filterSemanticDuplicates(
      [q('Van hai lá nằm ở đâu?'), q('Nhịp tim bình thường là bao nhiêu?')],
      ['Cấu tạo của gan gồm mấy thùy?']
    )
    expect(res.kept).toHaveLength(2)
    expect(res.removed).toBe(0)
  })

  it('dung embedder khi co: bat cau dien dat lai bang tu khac han', async () => {
    // Embedder gia: cau ve "bom mau / tuan hoan / tim" -> vector gan nhau.
    const embedder = async (texts: string[]): Promise<number[][]> =>
      texts.map((t) => (/máu/i.test(t) ? [1, 0.05, 0] : [0, 0, 1]))
    const res = await filterSemanticDuplicates(
      [q('Cơ quan bơm máu đi khắp cơ thể?'), q('Bộ phận nào duy trì tuần hoàn máu?')],
      [],
      { embedder, embedThreshold: 0.9 }
    )
    expect(res.kept).toHaveLength(1)
  })

  it('embedder tra null -> tu dong lui ve JS thuan, khong loi', async () => {
    const res = await filterSemanticDuplicates(
      [q('Van ba lá nằm ở đâu?'), q('Cầu thận lọc chất gì?')],
      [],
      { embedder: async () => null }
    )
    expect(res.kept).toHaveLength(2)
  })
})
