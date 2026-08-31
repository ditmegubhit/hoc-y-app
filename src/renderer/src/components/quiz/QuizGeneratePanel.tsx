import { useState } from 'react'
import { Sparkles, Cpu, Cloud } from 'lucide-react'
import { useAttachments } from '@renderer/queries/attachments'
import {
  useAiAvailability,
  useOllamaStatus,
  useQuizGeneration,
  type QuizScope
} from '@renderer/queries/quiz'
import type { AiProvider } from '@shared/types/ai'

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

function ollamaHint(status: ReturnType<typeof useOllamaStatus>['data']): string | null {
  if (!status) return null
  switch (status.status) {
    case 'ready':
      return null
    case 'not_installed':
      return 'Chưa cài Ollama trên máy. Cài Ollama rồi tải model qwen2.5:7b-instruct.'
    case 'not_running':
      return 'Không khởi động được Ollama. Mở app Ollama một lần rồi thử lại.'
    case 'no_model':
      return 'Ollama đã chạy nhưng chưa có model nào. Chạy: ollama pull qwen2.5:7b-instruct'
    case 'error':
      return `Lỗi kiểm tra Ollama: ${status.message}`
  }
}

function QuizGeneratePanel({ scope }: QuizGeneratePanelProps): React.JSX.Element {
  const [numQuestions, setNumQuestions] = useState(5)
  const [runningProvider, setRunningProvider] = useState<AiProvider | null>(null)

  const availabilityQuery = useAiAvailability()
  const ollamaQuery = useOllamaStatus()
  const { phase, outcome, generate } = useQuizGeneration(scope)

  const cliStatus = availabilityQuery.data?.status
  const ollamaReady = ollamaQuery.data?.status === 'ready'
  const claudeReady = cliStatus === 'ready'
  const topicWithoutLessons = scope.type === 'topic' && scope.lessonIds.length === 0
  const maxQuestions = scope.type === 'lesson' ? 20 : 50
  const busy = phase !== 'idle'

  const handleGenerate = (provider: AiProvider): void => {
    const clamped = Math.max(1, Math.min(numQuestions || 1, maxQuestions))
    setRunningProvider(provider)
    generate(clamped, provider)
  }

  const runLabel =
    phase === 'saving'
      ? 'Đang lưu...'
      : runningProvider === 'ollama'
        ? 'Máy đang soạn... (có thể vài phút)'
        : 'Đang soạn & rà soát...'

  const ollamaWarn = ollamaHint(ollamaQuery.data)

  return (
    <div className="quiz-generate-panel">
      <h4>
        <Sparkles size={14} /> Soạn câu hỏi bằng AI
      </h4>

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
      </div>

      {busy ? (
        <p className="quiz-generate-hint">{runLabel}</p>
      ) : (
        <div className="quiz-ai-engine-buttons">
          <button
            type="button"
            className="btn-primary"
            disabled={!ollamaReady || topicWithoutLessons}
            title={!ollamaReady ? (ollamaWarn ?? 'Ollama chưa sẵn sàng') : undefined}
            onClick={() => handleGenerate('ollama')}
          >
            <Cpu size={14} /> Soạn bằng máy (Ollama)
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!claudeReady || topicWithoutLessons}
            title={!claudeReady ? 'Claude Code CLI chưa sẵn sàng' : undefined}
            onClick={() => handleGenerate('claude')}
          >
            <Cloud size={14} /> Soạn bằng Claude <span className="quiz-ai-cost">tốn token</span>
          </button>
        </div>
      )}

      {!busy && !ollamaReady && ollamaWarn && (
        <p className="quiz-ai-warning">{ollamaWarn}</p>
      )}
      {!busy && !claudeReady && cliStatus === 'not_found' && (
        <p className="quiz-ai-warning">
          Chưa tìm thấy Claude Code CLI trên máy — vẫn soạn được bằng Ollama.
        </p>
      )}
      {!busy && !claudeReady && cliStatus === 'not_logged_in' && (
        <p className="quiz-ai-warning">
          Claude Code CLI chưa đăng nhập. Mở terminal chạy <code>claude</code> một lần để đăng
          nhập.
        </p>
      )}

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
