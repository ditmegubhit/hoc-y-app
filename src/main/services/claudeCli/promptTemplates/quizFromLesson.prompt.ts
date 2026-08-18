export const quizFromLessonJsonSchema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: {
            type: 'array',
            minItems: 4,
            maxItems: 4,
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                isCorrect: { type: 'boolean' }
              },
              required: ['text', 'isCorrect']
            }
          },
          explanation: { type: 'string' }
        },
        required: ['question', 'options']
      }
    }
  },
  required: ['questions']
} as const

const MAX_CONTENT_CHARS = 60_000

export function buildQuizFromLessonPrompt(params: {
  lessonTitle: string
  contentPieces: { label: string; text: string }[]
  numQuestions: number
}): { prompt: string; truncated: boolean } {
  let combined = params.contentPieces.map((p) => `--- ${p.label} ---\n${p.text}`).join('\n\n')

  let truncated = false
  if (combined.length > MAX_CONTENT_CHARS) {
    combined = combined.slice(0, MAX_CONTENT_CHARS)
    truncated = true
  }

  const prompt = `Bạn là trợ lý soạn câu hỏi ôn tập cho sinh viên Y khoa.
Dựa HOÀN TOÀN vào nội dung tài liệu dưới đây (không bịa thêm thông tin ngoài tài liệu),
hãy soạn ${params.numQuestions} câu hỏi trắc nghiệm cho bài học "${params.lessonTitle}".

Yêu cầu:
- Mỗi câu có đúng 4 lựa chọn, chỉ 1 đáp án đúng (isCorrect: true), 3 đáp án nhiễu hợp lý về mặt y khoa.
- Câu hỏi và đáp án bằng tiếng Việt.
- Nếu tài liệu không đủ thông tin để tạo đủ số câu yêu cầu, chỉ tạo số câu tương ứng với nội dung có thật.
- Không thêm giải thích ngoài JSON.

Nội dung tài liệu:
${combined}`

  return { prompt, truncated }
}
