import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DraftQuestion } from '@shared/types/question'
import type { LessonWidgetProps } from '../lesson/widgetRegistry'

function QuizAiSection({ lesson }: LessonWidgetProps): React.JSX.Element {
  const [numQuestions, setNumQuestions] = useState(5)
  const [draft, setDraft] = useState<DraftQuestion[] | null>(null)
  const [truncatedWarning, setTruncatedWarning] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const qc = useQueryClient()

  const savedQuestionsKey = ['questionBank', 'lesson', lesson.id]

  const availabilityQuery = useQuery({
    queryKey: ['ai', 'availability'],
    queryFn: () => window.api.ai.checkAvailability()
  })

  const savedQuestionsQuery = useQuery({
    queryKey: savedQuestionsKey,
    queryFn: () => window.api.ai.listQuestionsByLesson(lesson.id)
  })

  const generateMutation = useMutation({
    mutationFn: () =>
      window.api.ai.generateQuizFromLesson({ lessonId: lesson.id, numQuestions }),
    onSuccess: (result) => {
      if (!result.ok || !result.questions) {
        setErrorMessage(result.errorMessage ?? 'Có lỗi xảy ra khi tạo câu hỏi.')
        setDraft(null)
        return
      }
      setErrorMessage(null)
      setDraft(result.questions)
      setTruncatedWarning(Boolean(result.truncated))
    }
  })

  const saveMutation = useMutation({
    mutationFn: (questions: DraftQuestion[]) =>
      window.api.ai.saveDraftQuestions({ lessonId: lesson.id, questions }),
    onSuccess: () => {
      setDraft(null)
      qc.invalidateQueries({ queryKey: savedQuestionsKey })
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => window.api.ai.deleteQuestion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedQuestionsKey })
  })

  const cliStatus = availabilityQuery.data?.status

  return (
    <section className="lesson-widget quiz-ai-section">
      <h3>Tạo bài kiểm tra bằng AI (từ bài học này)</h3>

      {cliStatus === 'not_found' && (
        <p className="quiz-ai-warning">
          Chưa tìm thấy Claude Code CLI trên máy. Cần cài đặt Claude Code trước khi dùng tính năng
          này.
        </p>
      )}
      {cliStatus === 'not_logged_in' && (
        <p className="quiz-ai-warning">
          Claude Code CLI chưa đăng nhập. Mở terminal, chạy lệnh <code>claude</code> một lần để
          đăng nhập bằng tài khoản Pro/Max.
        </p>
      )}
      {cliStatus === 'error' && (
        <p className="quiz-ai-warning">Không kiểm tra được trạng thái Claude Code CLI.</p>
      )}

      <div className="quiz-ai-controls">
        <label>
          Số câu hỏi:
          <input
            type="number"
            min={1}
            max={20}
            value={numQuestions}
            onChange={(e) => setNumQuestions(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          disabled={generateMutation.isPending || cliStatus !== 'ready'}
          onClick={() => generateMutation.mutate()}
        >
          {generateMutation.isPending ? 'Đang soạn câu hỏi...' : 'Soạn câu hỏi'}
        </button>
      </div>

      {errorMessage && <p className="quiz-ai-error">{errorMessage}</p>}
      {truncatedWarning && (
        <p className="quiz-ai-warning">
          Nội dung bài học khá dài nên đã được rút gọn trước khi gửi cho AI.
        </p>
      )}

      {draft && draft.length > 0 && (
        <div className="quiz-ai-draft">
          <p>
            <strong>Xem lại trước khi lưu</strong> — kiểm tra kỹ nội dung/đáp án trước khi lưu vào
            ngân hàng câu hỏi:
          </p>
          {draft.map((q, idx) => (
            <div key={idx} className="quiz-ai-question">
              <strong>
                Câu {idx + 1}: {q.questionText}
              </strong>
              <ul>
                {q.options.map((opt) => (
                  <li key={opt.id} className={opt.isCorrect ? 'quiz-option-correct' : ''}>
                    {opt.text} {opt.isCorrect && '✓'}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="quiz-ai-draft-actions">
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate(draft)}
            >
              Lưu vào ngân hàng câu hỏi
            </button>
            <button type="button" onClick={() => setDraft(null)}>
              Huỷ
            </button>
          </div>
        </div>
      )}

      {savedQuestionsQuery.data && savedQuestionsQuery.data.length > 0 && (
        <div className="quiz-ai-saved">
          <p>Đã lưu vào ngân hàng câu hỏi ({savedQuestionsQuery.data.length} câu):</p>
          <ul>
            {savedQuestionsQuery.data.map((q) => (
              <li key={q.id}>
                <span>{q.questionText}</span>
                <button type="button" onClick={() => deleteMutation.mutate(q.id)}>
                  Xoá
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default QuizAiSection
