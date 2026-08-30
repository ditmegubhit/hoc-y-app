// Bo tieu chi chat luong cho cau hoi trac nghiem - dung chung cho ca luot "ra
// soat & sua" sau khi sinh cau moi va nut "Ra soat & cai tien" tren ngan hang.

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

interface Piece {
  label: string
  text: string
}

const MAX_SOURCE_CHARS = 90_000

function sourceBlock(pieces: Piece[]): string {
  let combined = pieces.map((p) => `===== ${p.label} =====\n${p.text}`).join('\n\n')
  if (combined.length > MAX_SOURCE_CHARS) combined = combined.slice(0, MAX_SOURCE_CHARS)
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
${sourceBlock(params.contentPieces)}`
}

// Luot ra soat cho cau DA LUU trong ngan hang - PHAI tra ve dung so cau, dung
// thu tu (map lai theo index).
export function buildReviewPrompt(params: {
  contentPieces: Piece[]
  questions: { questionText: string; options: { text: string; isCorrect: boolean }[]; explanation: string | null }[]
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
${sourceBlock(params.contentPieces)}`
}
