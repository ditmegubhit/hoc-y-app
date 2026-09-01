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

// Schema GON cho Ollama: options la mang 4 chuoi + `correct` la chi so 0..3.
// It ky tu "khung" hon nhieu so voi mang object {text,isCorrect} -> giam ~25%
// token dau ra (sinh chu tren iGPU la nut co chai). Map lai ve {id,text,isCorrect}
// o tang goi.
export const ollamaQuizJsonSchema = {
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
            items: { type: 'string' }
          },
          correct: { type: 'integer', minimum: 0, maximum: 3 },
          explanation: { type: 'string' }
        },
        required: ['question', 'options', 'correct']
      }
    }
  },
  required: ['questions']
} as const

import type { AiProvider } from '../../../../shared/types/ai'

// Claude nuot ca tram nghin ky tu; Ollama chay tren may bi gioi han num_ctx +
// CPU cham nen cat manh hon.
const MAX_CONTENT_CHARS_BY_PROVIDER: Record<AiProvider, number> = {
  claude: 120_000,
  // Ollama num_ctx 8k, chua system prompt + few-shot + cho phan sinh ~3k token
  // -> gioi han nguon o muc vua phai (nguon dai hon se bi cat, co canh bao).
  ollama: 11_000
}
// Gioi han so cau da co dua vao prompt (tranh phinh token khi ngan hang lon).
// Ollama: nang tu 8 len ~22 (van nguyen van, chua rut gon) de model "biet" nhieu
// cau da hoi hon truoc khi sinh, giam so vong phai sinh bu vi trung; dedup van
// chay sau khi sinh lam luoi an toan. Uu tien cau MOI NHAT (ca cau vua sinh
// trong chinh luot nay, xem `avoid.unshift` o generateQuizFromLessons.ts).
const MAX_EXISTING_BY_PROVIDER: Record<AiProvider, number> = {
  claude: 120,
  ollama: 22
}

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
  provider?: AiProvider
  // Ghi de ngan sach ky tu nguon (Ollama: khac nhau tuy che do "hoc").
  maxContentChars?: number
}): { prompt: string; truncated: boolean } {
  const provider: AiProvider = params.provider ?? 'claude'
  const pieces = params.contentPieces
  const budget = params.maxContentChars ?? MAX_CONTENT_CHARS_BY_PROVIDER[provider]
  const alloc = allocateBudget(pieces, budget)
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

  let existing = (params.existingQuestions ?? []).slice(0, MAX_EXISTING_BY_PROVIDER[provider])
  // Them tran ky tu cho Ollama (danh sach nang tu 8 len 22 cau nguyen van -> vai
  // cau dai bat thuong van khong duoc lam phinh prompt qua muc, anh huong toc do).
  if (provider === 'ollama') {
    let used = 0
    let cut = existing.length
    for (let i = 0; i < existing.length; i++) {
      used += existing[i].length + 4
      if (used > 2600) {
        cut = i
        break
      }
    }
    existing = existing.slice(0, cut)
  }
  // Khoi "dung lap" thay doi moi lan soan -> dat o CUOI prompt de phan noi dung
  // nguon (on dinh theo bai hoc) duoc cache prompt tai su dung o lan soan sau.
  const avoidBlock =
    existing.length > 0
      ? `\n\nKHÔNG lặp lại hoặc chỉ diễn đạt lại theo cách khác các câu đã có sau đây — soạn câu MỚI, khía cạnh khác:\n${existing.map((q) => `  · ${q}`).join('\n')}`
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
- Không thêm giải thích ngoài JSON.

NỘI DUNG CÁC NGUỒN:
${body}${avoidBlock}`

  return { prompt, truncated }
}
