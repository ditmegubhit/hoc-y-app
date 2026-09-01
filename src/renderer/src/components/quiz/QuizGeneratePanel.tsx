import { useState } from 'react'
import { Sparkles, Cpu, Cloud } from 'lucide-react'
import { useAttachments } from '@renderer/queries/attachments'
import {
  useAiAvailability,
  useAiSettings,
  useOllamaStatus,
  useQuizGeneration,
  type GenerateOptions,
  type QuizScope
} from '@renderer/queries/quiz'
import type { QuizGenProgress } from '@shared/types/claudeCli'
import type { AiProvider } from '@shared/types/ai'

function progressText(p: QuizGenProgress | null): string | null {
  if (!p) return null
  if (p.phase === 'refining') return 'Đang rà soát & chỉnh lại các câu...'
  if (p.phase === 'topping_up') {
    return `Đã có ${p.kept}/${p.target} câu — đang tạo bù cho đủ...`
  }
  // generating
  if (typeof p.streaming === 'number' && p.streaming > 0) {
    return `Máy đang soạn... ${p.streaming}/${p.target} câu`
  }
  return p.round > 1 ? 'Đang tạo bù thêm câu...' : 'Máy đang soạn... (có thể vài phút)'
}

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
  const settingsQuery = useAiSettings()
  const { phase, outcome, progress, generate } = useQuizGeneration(scope)

  const cliStatus = availabilityQuery.data?.status
  const ollamaReady = ollamaQuery.data?.status === 'ready'
  const claudeReady = cliStatus === 'ready'
  // Nut "Soan bang may": Ollama soan roi Claude sua (neu bat trong Cai dat + Claude san sang).
  const refineOllamaWithClaude =
    (settingsQuery.data?.ollamaRefineWithClaude ?? true) && claudeReady
  const topicWithoutLessons = scope.type === 'topic' && scope.lessonIds.length === 0
  const maxQuestions = scope.type === 'lesson' ? 20 : 50
  const busy = phase !== 'idle'

  const handleGenerate = (provider: AiProvider): void => {
    const clamped = Math.max(1, Math.min(numQuestions || 1, maxQuestions))
    const options: GenerateOptions =
      provider === 'ollama' ? { refineWithClaude: refineOllamaWithClaude } : {}
    setRunningProvider(provider)
    generate(clamped, provider, options)
  }

  const runLabel =
    phase === 'saving'
      ? 'Đang lưu...'
      : (progressText(progress) ??
        (runningProvider === 'ollama'
          ? 'Máy đang soạn... (có thể vài phút)'
          : 'Đang soạn & rà soát...'))

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
            title={
              !ollamaReady
                ? (ollamaWarn ?? 'Ollama chưa sẵn sàng')
                : refineOllamaWithClaude
                  ? 'Ollama soạn, sau đó Claude rà soát & sửa (tốn ít token, Ollama học theo)'
                  : 'Ollama soạn hoàn toàn trên máy (offline)'
            }
            onClick={() => handleGenerate('ollama')}
          >
            <Cpu size={14} /> Soạn bằng máy (Ollama)
            {refineOllamaWithClaude && <span className="quiz-ai-cost">Claude sửa · ít token</span>}
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
          {outcome.duplicates > 0 && ` (đã loại ${outcome.duplicates} câu hỏng/trùng)`}.
          {outcome.shortfall > 0 &&
            ` Còn thiếu ${outcome.shortfall} câu — nguồn tài liệu chưa đủ nội dung khác để soạn thêm.`}{' '}
          Các câu mới được tô nền xanh trong &quot;Ngân hàng câu hỏi&quot; cho tới lần soạn kế tiếp.
        </p>
      )}
    </div>
  )
}

export default QuizGeneratePanel
