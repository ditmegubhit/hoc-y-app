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

const MAX_CONTENT_CHARS = 120_000
// Gioi han so cau da co dua vao prompt (tranh phinh token khi ngan hang lon).
const MAX_EXISTING_IN_PROMPT = 120

interface Piece {
  label: string
  text: string
}

// Chia ngan sach ky tu cho tung nguon: chia deu, nguon ngan tra lai phan thua
// cho nguon dai -> khong bi ghi chu (dung dau mang) an het cho, cac file sau
// van co phan.
function allocateBudget(pieces: Piece[], budget: number): { text: string; truncated: boolean }[] {
  const share = new Array<number>(pieces.length).fill(0)
  const byLenAsc = pieces.map((p, i) => ({ i, len: p.text.length })).sort((a, b) => a.len - b.len)
  let remaining = budget
  let left = pieces.length
  for (const { i, len } of byLenAsc) {
    const per = Math.floor(remaining / Math.max(left, 1))
    const take = Math.min(len, per)
    share[i] = take
    remaining -= take
    left -= 1
  }
  return pieces.map((p, i) => ({
    text: p.text.length > share[i] ? p.text.slice(0, share[i]) : p.text,
    truncated: p.text.length > share[i]
  }))
}

export function buildQuizFromLessonPrompt(params: {
  subjectTitle: string
  contentPieces: Piece[]
  numQuestions: number
  existingQuestions?: string[]
}): { prompt: string; truncated: boolean } {
  const pieces = params.contentPieces
  const alloc = allocateBudget(pieces, MAX_CONTENT_CHARS)
  const truncated = alloc.some((a) => a.truncated)

  const sourcesList = pieces.map((p, i) => `${i + 1}. ${p.label}`).join('\n')
  const body = pieces
    .map(
      (p, i) =>
        `===== NGUỒN ${i + 1}: ${p.label} =====\n${alloc[i].text}${
          alloc[i].truncated ? '\n[...phần sau đã được cắt bớt]' : ''
        }`
    )
    .join('\n\n')

  const existing = (params.existingQuestions ?? []).slice(0, MAX_EXISTING_IN_PROMPT)
  const avoidBlock =
    existing.length > 0
      ? `\n- KHÔNG lặp lại hoặc chỉ diễn đạt lại theo cách khác các câu hỏi đã có sau đây (soạn câu MỚI, khía cạnh khác):\n${existing.map((q) => `  · ${q}`).join('\n')}`
      : ''

  const prompt = `Bạn là trợ lý soạn câu hỏi ôn tập cho sinh viên Y khoa.

Có ${pieces.length} nguồn tài liệu:
${sourcesList}

Hãy soạn ${params.numQuestions} câu hỏi trắc nghiệm cho "${params.subjectTitle}", dựa HOÀN TOÀN vào các nguồn trên (không bịa thêm thông tin ngoài tài liệu).

Yêu cầu:
- Ra câu hỏi TRẢI ĐỀU trên TẤT CẢ các nguồn — KHÔNG chỉ tập trung vào ghi chú, KHÔNG bỏ sót nguồn nào có nội dung đáng hỏi. Nếu một nguồn ít nội dung thì phân bổ phần còn lại cho các nguồn khác thay vì bịa.
- Mỗi câu có đúng 4 lựa chọn, chỉ 1 đáp án đúng (isCorrect: true), 3 đáp án nhiễu hợp lý về mặt y khoa.
- Câu hỏi và đáp án bằng tiếng Việt.
- Nếu tài liệu không đủ để tạo đủ số câu yêu cầu, chỉ tạo số câu tương ứng với nội dung có thật.
- Không thêm giải thích ngoài JSON.${avoidBlock}

NỘI DUNG CÁC NGUỒN:
${body}`

  return { prompt, truncated }
}
