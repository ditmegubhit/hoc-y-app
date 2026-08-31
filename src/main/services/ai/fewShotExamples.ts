import * as quizLearningRepo from '../../db/repositories/quizLearning.repo'
import * as questionBankRepo from '../../db/repositories/questionBank.repo'
import { normalizeQuestionText } from '../quiz/dedup'
import type { QuestionDraftContent } from '../../../shared/types/question'

// "Cho Ollama hoc ban": vai cau mau dat chuan lam hinh mau van phong. Model 7B
// bam theo vi du tot hon la doc mo ta suong.
//
// - 2 cau mau tay trung tinh (luon co).
// - Toi da 3 cau mau DONG: uu tien cap Claude-sua trong pham vi -> cap bat ky
//   -> cau do Claude tao trong pham vi. Chi dua ban DA SUA/DA DAT lam mau.

interface ExampleQuestion {
  question: string
  options: { text: string; isCorrect: boolean }[]
  explanation: string
}

// Giu it de prompt Ollama khong phinh (prompt eval tren iGPU rat cham).
const MAX_DYNAMIC = 2

const HAND_WRITTEN: ExampleQuestion[] = [
  {
    question:
      'Ở người trưởng thành khỏe mạnh, cấu trúc nào chịu trách nhiệm chính cho quá trình trao đổi khí tại phổi?',
    options: [
      { text: 'Phế nang', isCorrect: true },
      { text: 'Tiểu phế quản tận', isCorrect: false },
      { text: 'Màng phổi lá tạng', isCorrect: false },
      { text: 'Khí quản', isCorrect: false }
    ],
    explanation:
      'Trao đổi khí O2/CO2 diễn ra qua màng phế nang – mao mạch. Các đường dẫn khí phía trên chỉ dẫn khí, không trao đổi khí; màng phổi không tham gia.'
  },
  {
    question: 'Một bệnh nhân giảm tiết ADH sẽ có thay đổi nào rõ nhất về nước tiểu?',
    options: [
      { text: 'Nước tiểu loãng, thể tích tăng', isCorrect: true },
      { text: 'Nước tiểu cô đặc, thể tích giảm', isCorrect: false },
      { text: 'Nước tiểu có protein', isCorrect: false },
      { text: 'Nước tiểu có glucose', isCorrect: false }
    ],
    explanation:
      'ADH tăng tái hấp thu nước ở ống góp. Thiếu ADH → nước không được tái hấp thu → tiểu nhiều, nước tiểu loãng (đái tháo nhạt). Protein/glucose niệu do cơ chế khác.'
  }
]

function toExample(q: QuestionDraftContent): ExampleQuestion {
  return {
    question: q.questionText,
    options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
    explanation: q.explanation ?? ''
  }
}

function formatExamples(list: ExampleQuestion[]): string {
  return list
    .map(
      (q, i) =>
        `Ví dụ ${i + 1}:\n` +
        JSON.stringify(
          { question: q.question, options: q.options, explanation: q.explanation },
          null,
          1
        )
    )
    .join('\n\n')
}

/**
 * Khoi few-shot cho prompt Ollama.
 * - `enabled=false` -> chi 2 mau tay.
 * - `existingQuestions` -> khong dua mau dong trung voi cac cau nay (tranh vua bao
 *   "dung lap" vua "bat chuoc" cung 1 cau).
 */
export function buildFewShotBlock(params: {
  lessonIds?: string[]
  topicId?: string | null
  enabled: boolean
  existingQuestions?: string[]
}): string {
  const examples: ExampleQuestion[] = [...HAND_WRITTEN]

  if (params.enabled) {
    const avoid = new Set((params.existingQuestions ?? []).map(normalizeQuestionText))
    const usedKeys = new Set(examples.map((e) => normalizeQuestionText(e.question)))
    const dynamic: ExampleQuestion[] = []

    const pushIfNew = (c: QuestionDraftContent): void => {
      if (dynamic.length >= MAX_DYNAMIC) return
      const key = normalizeQuestionText(c.questionText)
      if (key === '' || avoid.has(key) || usedKeys.has(key)) return
      usedKeys.add(key)
      dynamic.push(toExample(c))
    }

    try {
      const lessonIds = params.lessonIds ?? []
      for (const ex of quizLearningRepo.listExamplesForScope({
        lessonIds,
        topicId: params.topicId ?? null,
        limit: MAX_DYNAMIC
      })) {
        pushIfNew(ex.after)
      }

      if (dynamic.length < MAX_DYNAMIC) {
        const claudeQs =
          params.topicId != null
            ? questionBankRepo.listClaudeGeneratedUnderTopic(params.topicId, MAX_DYNAMIC * 2)
            : lessonIds.length > 0
              ? questionBankRepo.listClaudeGeneratedByLessonIds(lessonIds, MAX_DYNAMIC * 2)
              : []
        for (const q of claudeQs) {
          pushIfNew({ questionText: q.questionText, options: q.options, explanation: q.explanation })
        }
      }
    } catch {
      // khong co du lieu thi thoi
    }

    examples.push(...dynamic)
  }

  return `VÍ DỤ MẪU (bám sát văn phong, độ dài phương án và cách viết giải thích như các ví dụ này):\n\n${formatExamples(
    examples
  )}`
}
