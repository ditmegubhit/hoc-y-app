import { describe, it, expect } from 'vitest'
import { buildQuizFromLessonPrompt } from './quizFromLesson.prompt'

describe('buildQuizFromLessonPrompt - cua so noi dung theo vong', () => {
  it('nguon ngan hon ngan sach: khong cat, moi vong giong nhau, khong "truncated"', () => {
    const pieces = [{ label: 'Ghi chú', text: 'A'.repeat(500) }]
    const r1 = buildQuizFromLessonPrompt({
      subjectTitle: 'X',
      contentPieces: pieces,
      numQuestions: 5,
      maxContentChars: 2000,
      round: 1
    })
    const r2 = buildQuizFromLessonPrompt({
      subjectTitle: 'X',
      contentPieces: pieces,
      numQuestions: 5,
      maxContentChars: 2000,
      round: 2
    })
    expect(r1.truncated).toBe(false)
    expect(r1.prompt).toBe(r2.prompt)
    expect(r1.prompt).toContain('A'.repeat(500))
  })

  it('nguon dai hon ngan sach: moi vong lay 1 phan khac nhau, phu het qua nhieu vong', () => {
    // 6000 ky tu, ngan sach 2000 -> 3 cua so
    const text = [
      'AAAA'.repeat(500), // phan 1
      'BBBB'.repeat(500), // phan 2
      'CCCC'.repeat(500) // phan 3
    ].join('')
    const pieces = [{ label: 'File', text }]
    const seen = new Set<string>()
    for (let round = 1; round <= 3; round++) {
      const { prompt, truncated } = buildQuizFromLessonPrompt({
        subjectTitle: 'X',
        contentPieces: pieces,
        numQuestions: 5,
        maxContentChars: 2000,
        round
      })
      expect(truncated).toBe(true)
      expect(prompt).toContain(`PHẦN ${round}/3`)
      if (prompt.includes('AAAA'.repeat(100))) seen.add('1')
      if (prompt.includes('BBBB'.repeat(100))) seen.add('2')
      if (prompt.includes('CCCC'.repeat(100))) seen.add('3')
    }
    // sau 3 vong, ca 3 phan deu da tung xuat hien trong prompt
    expect([...seen].sort()).toEqual(['1', '2', '3'])
  })

  it('vong xoay vong (round 4 == round 1 khi co 3 cua so)', () => {
    const pieces = [{ label: 'File', text: 'AAAA'.repeat(1500) }] // 6000 ky tu
    const r1 = buildQuizFromLessonPrompt({
      subjectTitle: 'X',
      contentPieces: pieces,
      numQuestions: 5,
      maxContentChars: 2000,
      round: 1
    })
    const r4 = buildQuizFromLessonPrompt({
      subjectTitle: 'X',
      contentPieces: pieces,
      numQuestions: 5,
      maxContentChars: 2000,
      round: 4
    })
    expect(r1.prompt).toBe(r4.prompt)
  })

  it('windowSeed day cua so tien len (bai da co nhieu cau -> hoi sang phan sau)', () => {
    const text = ['AAAA'.repeat(500), 'BBBB'.repeat(500), 'CCCC'.repeat(500)].join('')
    const pieces = [{ label: 'File', text }]
    const base = { subjectTitle: 'X', contentPieces: pieces, numQuestions: 5, maxContentChars: 2000 }
    // round 1, chua co cau -> phan 1
    expect(buildQuizFromLessonPrompt({ ...base, round: 1, windowSeed: 0 }).prompt).toContain(
      'PHẦN 1/3'
    )
    // round 1, da co ~16 cau -> windowSeed 2 -> phan 3
    expect(buildQuizFromLessonPrompt({ ...base, round: 1, windowSeed: 2 }).prompt).toContain(
      'PHẦN 3/3'
    )
  })

  it('Ollama: prompt gon - khong co khoi huong dan "khai thac sau" dai dong', () => {
    const base = {
      subjectTitle: 'X',
      contentPieces: [{ label: 'Ghi chú', text: 'noi dung' }],
      numQuestions: 5,
      existingQuestions: ['Câu 1 đã có?'],
      round: 2
    }
    const ollama = buildQuizFromLessonPrompt({ ...base, provider: 'ollama' }).prompt
    const claude = buildQuizFromLessonPrompt({ ...base, provider: 'claude' }).prompt
    expect(ollama).not.toContain('Khai thác SÂU')
    expect(ollama).not.toContain('chẩn đoán phân biệt')
    expect(claude).toContain('Khai thác SÂU')
    // ca hai deu co danh sach cau can tranh
    expect(ollama).toContain('Câu 1 đã có?')
    expect(claude).toContain('Câu 1 đã có?')
    // prompt Ollama ngan hon dang ke
    expect(ollama.length).toBeLessThan(claude.length)
  })

  it('khoi "tranh lap" nhac AI dung ket luan het noi dung', () => {
    const { prompt } = buildQuizFromLessonPrompt({
      subjectTitle: 'X',
      contentPieces: [{ label: 'Ghi chú', text: 'noi dung' }],
      numQuestions: 5,
      existingQuestions: ['Câu 1 đã có?', 'Câu 2 đã có?'],
      round: 2
    })
    expect(prompt).toContain('VẪN CÒN nhiều nội dung')
    expect(prompt).toContain('Câu 1 đã có?')
  })
})
