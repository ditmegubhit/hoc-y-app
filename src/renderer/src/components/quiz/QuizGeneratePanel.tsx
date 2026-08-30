import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useAttachments } from '@renderer/queries/attachments'
import { useAiAvailability, useQuizGeneration, type QuizScope } from '@renderer/queries/quiz'

interface QuizGeneratePanelProps {
  scope: QuizScope
}

function SourceHint({ lessonId }: { lessonId: string }): React.JSX.Element | null {
  const { data } = useAttachments(lessonId)
  if (!data) return null
  const ready = data.filter(
    (a) => a.extractionStatus === 'done' && Boolean(a.extractedText?.trim())
  ).length
  const processing = data.filter(
    (a) => a.extractionStatus === 'pending' || a.extractionStatus === 'ocr_processing'
  ).length
  return (
    <p className="quiz-generate-hint">
      Nguồn: ghi chú của bài + {ready} tài liệu đã xử lý.
      {processing > 0 &&
        ` Còn ${processing} tài liệu đang xử lý — chưa dùng được, đợi xong rồi soạn lại.`}
    </p>
  )
}

function QuizGeneratePanel({ scope }: QuizGeneratePanelProps): React.JSX.Element {
  const [numQuestions, setNumQuestions] = useState(5)

  const availabilityQuery = useAiAvailability()
  const { phase, outcome, generate } = useQuizGeneration(scope)

  const cliStatus = availabilityQuery.data?.status
  const topicWithoutLessons = scope.type === 'topic' && scope.lessonIds.length === 0
  const maxQuestions = scope.type === 'lesson' ? 20 : 50
  const busy = phase !== 'idle'

  const handleGenerate = (): void => {
    const clamped = Math.max(1, Math.min(numQuestions || 1, maxQuestions))
    generate(clamped)
  }

  const buttonLabel =
    phase === 'generating'
      ? 'Đang soạn & rà soát...'
      : phase === 'saving'
        ? 'Đang lưu...'
        : 'Soạn câu hỏi'

  return (
    <div className="quiz-generate-panel">
      <h4>
        <Sparkles size={14} /> Soạn câu hỏi bằng AI
      </h4>

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

      {topicWithoutLessons && (
        <p className="quiz-ai-warning">Chọn ít nhất một bài học ở trên để soạn câu hỏi.</p>
      )}

      {scope.type === 'lesson' && <SourceHint lessonId={scope.lessonId} />}
      {scope.type === 'topic' && !topicWithoutLessons && (
        <p className="quiz-generate-hint">
          Nguồn: ghi chú + tài liệu (đã trích xong) của các bài đã chọn.
        </p>
      )}

      <div className="quiz-ai-controls">
        <label>
          Số câu hỏi:
          <input
            type="number"
            min={1}
            max={maxQuestions}
            value={numQuestions}
            onChange={(e) => setNumQuestions(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          disabled={busy || cliStatus !== 'ready' || topicWithoutLessons}
          onClick={handleGenerate}
        >
          {buttonLabel}
        </button>
      </div>

      {outcome?.error && <p className="quiz-ai-error">{outcome.error}</p>}
      {outcome?.truncated && (
        <p className="quiz-ai-warning">
          Nội dung khá dài nên đã được rút gọn trước khi gửi cho AI.
        </p>
      )}
      {outcome && !outcome.error && (
        <p className="quiz-generate-saved">
          Đã tạo và lưu {outcome.savedCount} câu hỏi mới
          {outcome.duplicates > 0 && ` (bỏ ${outcome.duplicates} câu trùng ngân hàng)`}. Các câu
          mới được tô nền xanh trong &quot;Ngân hàng câu hỏi&quot; cho tới lần soạn kế tiếp.
        </p>
      )}
    </div>
  )
}

export default QuizGeneratePanel
