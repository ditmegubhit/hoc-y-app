// Bo tieu chi chat luong cho cau hoi trac nghiem - dung chung cho ca luot "ra
// soat & sua" sau khi sinh cau moi va nut "Ra soat & cai tien" tren ngan hang.

import type { AiProvider } from '../../../../shared/types/ai'

export const QUIZ_QUALITY_CHECKLIST = `TIÊU CHÍ CHẤT LƯỢNG (áp dụng cho TỪNG câu):
1. Kiến thức: chính xác về mặt y khoa và ĐÚNG với nội dung nguồn. Loại bỏ thông tin mơ hồ, sai lệch, lỗi thời.
2. Đúng một đáp án đúng RÕ RÀNG; ba phương án còn lại phải THỰC SỰ SAI trong bối cảnh câu hỏi.
3. Phương án nhiễu: sai nhưng HỢP LÝ, gần đúng, có tính phân biệt cao (là lỗi/nhầm lẫn thường gặp). KHÔNG dùng đáp án vô lý, hiển nhiên sai, hoặc dễ loại trừ.
4. Cân bằng: 4 phương án A/B/C/D có độ dài và cấu trúc ngữ pháp tương đương. Đáp án đúng KHÔNG được dài hơn/chi tiết hơn/đặc biệt hơn các phương án khác. Không có manh mối ngữ pháp (số ít/số nhiều, "một"/"các"...) rò rỉ đáp án.
5. Vị trí đáp án đúng: phân bố NGẪU NHIÊN và ĐỀU giữa 4 vị trí trong cả bộ câu hỏi — không dồn vào một vị trí cố định.
6. Câu hỏi tự nhiên, không đánh đố, không chơi chữ, không có nhiều cách hiểu, không chứa manh mối trực tiếp dẫn tới đáp án.
7. Thực sự kiểm tra KIẾN THỨC cần đánh giá, không chỉ kiểm tra khả năng đọc hiểu câu chữ. Ưu tiên câu yêu cầu vận dụng / phân biệt khi phù hợp, nhưng KHÔNG đổi bản chất kiến thức hay phạm vi cần kiểm tra.
8. Độ khó phù hợp mục tiêu ôn tập cho sinh viên Y.
9. Không câu nào lặp nội dung hoặc mô-típ của câu khác trong bộ.
10. Chính tả, thuật ngữ y khoa, ngữ pháp tiếng Việt chuẩn.
11. Giải thích (explanation): ngắn gọn, nêu VÌ SAO đáp án đúng và (nếu cần) vì sao (các) phương án kia sai.

SAU KHI SỬA: tự kiểm tra lại TỪNG câu một lần nữa — xác nhận đáp án được đánh dấu isCorrect:true là chính xác và ba phương án còn lại đều sai.`

// Bo quy tac RIENG cho Ollama (model 7B) khi SINH cau - ngan gon, cu the, co vi
// du sai/dung tai cho. Checklist cua Claude (o tren) qua dai/truu tuong voi 7B.
export const OLLAMA_QUIZ_RULES = `Bạn là trợ lý soạn câu hỏi trắc nghiệm ôn tập cho sinh viên Y khoa Việt Nam.
Chỉ trả về JSON đúng schema được yêu cầu. Không viết gì ngoài JSON. Viết hoàn toàn bằng tiếng Việt.
Mỗi câu gồm: "question" (chuỗi), "options" (mảng đúng 4 chuỗi), "correct" (số 0-3, chỉ vị trí phương án đúng trong "options"), "explanation" (chuỗi).

QUY TẮC BẮT BUỘC — tự kiểm lại từng câu trước khi trả về:

1. NGUỒN. Chỉ dùng thông tin có trong phần TÀI LIỆU NGUỒN người dùng cung cấp. Không thêm kiến thức bên ngoài. Nếu tài liệu không đủ để tạo đủ số câu yêu cầu, tạo ít câu hơn — tuyệt đối không bịa.

2. ĐÁP ÁN. Mỗi câu có đúng 4 phương án khác nhau hoàn toàn; "correct" trỏ đúng phương án đúng. Ba phương án còn lại phải thực sự sai trong bối cảnh câu hỏi.

3. CÂN BẰNG ĐỘ DÀI. 4 phương án phải dài xấp xỉ nhau và cùng kiểu diễn đạt. KHÔNG để phương án đúng dài hơn, chi tiết hơn hay "đầy đủ hơn" ba phương án kia — đó là lỗi lộ đáp án.
   Sai: đúng = "Ức chế men chuyển, chẹn beta, lợi tiểu và kháng aldosterone"; sai = "Chỉ dùng lợi tiểu"
   Đúng: cả 4 phương án đều nêu một nhóm thuốc cụ thể, độ dài tương đương.

4. PHƯƠNG ÁN NHIỄU. Ba phương án sai phải hợp lý, là nhầm lẫn thường gặp của sinh viên. KHÔNG dùng phương án vô lý, hiển nhiên sai hoặc lạc đề.

5. CẤM các dạng phương án: mở đầu bằng "Chỉ...", "Tất cả các ý trên", "Không ý nào đúng", "A và B đúng", "Cả A, B và C".

6. CẤM TRÙNG LẶP. Không nhắc lại nguyên văn lời câu hỏi trong phương án. Không để hai phương án trùng hoặc gần trùng nghĩa. Các câu trong bộ không hỏi trùng nội dung — mỗi câu kiểm tra một ý kiến thức riêng.

7. VỊ TRÍ ĐÁP ÁN ĐÚNG. Rải đều giữa 4 vị trí trong cả bộ câu hỏi; không đặt đáp án đúng luôn ở cùng một vị trí.

8. CÂU HỎI. Tự nhiên, rõ ràng, chỉ một cách hiểu. Không đánh đố, không chơi chữ, không gài manh mối dẫn thẳng tới đáp án.

9. GIẢI THÍCH. MỘT câu ngắn (tối đa 20 từ): nói thẳng vì sao đáp án đúng.`

// Prompt he thong cho luot Ollama SINH cau = quy tac + khoi few-shot (neu co).
export function buildOllamaQuizSystemPrompt(fewShotBlock?: string): string {
  return `${OLLAMA_QUIZ_RULES}${fewShotBlock ? `\n\n${fewShotBlock}` : ''}`
}

interface Piece {
  label: string
  text: string
}

// Luot ra soat khong can toan bo nguon; cat vua du de doi chieu kien thuc.
// Ollama gioi han num_ctx nen cat manh hon nhieu.
const MAX_SOURCE_BY_PROVIDER: Record<AiProvider, number> = {
  claude: 45_000,
  ollama: 10_000
}

function sourceBlock(pieces: Piece[], provider: AiProvider = 'claude'): string {
  const max = MAX_SOURCE_BY_PROVIDER[provider]
  let combined = pieces.map((p) => `===== ${p.label} =====\n${p.text}`).join('\n\n')
  if (combined.length > max) combined = combined.slice(0, max)
  return combined
}

function questionsJson(
  questions: { questionText: string; options: { text: string; isCorrect: boolean }[]; explanation: string | null }[]
): string {
  return JSON.stringify(
    questions.map((q) => ({
      question: q.questionText,
      options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
      explanation: q.explanation ?? ''
    })),
    null,
    1
  )
}

// Luot ra soat cho cau VUA SINH - cho phep them/bot so cau, mien la tot hon.
export function buildRefinePrompt(params: {
  subjectTitle: string
  contentPieces: Piece[]
  questions: { questionText: string; options: { text: string; isCorrect: boolean }[]; explanation: string | null }[]
  existingQuestions?: string[]
  provider?: AiProvider
}): string {
  const avoid =
    params.existingQuestions && params.existingQuestions.length > 0
      ? `\n\nTRÁNH lặp nội dung/mô-típ các câu đã có sau đây:\n${params.existingQuestions
          .slice(0, 120)
          .map((q) => `- ${q}`)
          .join('\n')}`
      : ''

  return `Bạn là chuyên gia thẩm định câu hỏi trắc nghiệm y khoa.

Dưới đây là bộ câu hỏi nháp cho "${params.subjectTitle}" và NỘI DUNG NGUỒN gốc.
Hãy RÀ SOÁT và CẢI TIẾN toàn bộ bộ câu hỏi theo tiêu chí bên dưới, GIỮ NGUYÊN phạm vi kiến thức và mục tiêu kiểm tra ban đầu của mỗi câu.

${QUIZ_QUALITY_CHECKLIST}

Trả về bộ câu hỏi ĐÃ CẢI TIẾN (cùng định dạng JSON: mảng questions, mỗi câu có question, options[4] mỗi option {text, isCorrect}, explanation). Số câu có thể bằng hoặc ít hơn bản nháp nếu phải loại câu hỏng không cứu được — KHÔNG bịa thêm câu ngoài phạm vi nguồn.${avoid}

BỘ CÂU HỎI NHÁP:
${questionsJson(params.questions)}

NỘI DUNG NGUỒN:
${sourceBlock(params.contentPieces, params.provider)}`
}

// Luot ra soat cho cau DA LUU trong ngan hang - PHAI tra ve dung so cau, dung
// thu tu (map lai theo index).
export function buildReviewPrompt(params: {
  contentPieces: Piece[]
  questions: { questionText: string; options: { text: string; isCorrect: boolean }[]; explanation: string | null }[]
  provider?: AiProvider
}): string {
  return `Bạn là chuyên gia thẩm định câu hỏi trắc nghiệm y khoa.

Dưới đây là ${params.questions.length} câu hỏi đã lưu và NỘI DUNG NGUỒN liên quan.
Hãy RÀ SOÁT và CẢI TIẾN từng câu theo tiêu chí bên dưới, GIỮ NGUYÊN phạm vi kiến thức và mục tiêu kiểm tra của từng câu (câu số i vẫn kiểm tra đúng điểm kiến thức mà câu số i đang nhắm tới).

${QUIZ_QUALITY_CHECKLIST}

QUAN TRỌNG:
- Trả về ĐÚNG ${params.questions.length} câu, ĐÚNG THỨ TỰ như đầu vào (câu thứ i của kết quả tương ứng câu thứ i của đầu vào).
- Nếu một câu đã tốt, giữ nguyên (vẫn trả lại câu đó).
- Mỗi câu có đúng 4 option.
- Định dạng JSON: mảng questions, mỗi câu { question, options: [{text, isCorrect}] x4, explanation }.

CÁC CÂU HỎI HIỆN CÓ:
${questionsJson(params.questions)}

NỘI DUNG NGUỒN:
${sourceBlock(params.contentPieces, params.provider)}`
}
