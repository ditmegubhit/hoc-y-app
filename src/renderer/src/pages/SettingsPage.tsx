import { Moon, Sun, Cpu, Cloud, RefreshCw } from 'lucide-react'
import { useTheme } from '@renderer/hooks/useTheme'
import {
  useAiAvailability,
  useAiSettings,
  useOllamaStatus,
  useSetAiSettings
} from '@renderer/queries/quiz'

function ollamaStatusText(status: ReturnType<typeof useOllamaStatus>['data']): string {
  if (!status) return 'Đang kiểm tra...'
  switch (status.status) {
    case 'ready':
      return `Sẵn sàng — ${status.models.length} model đã tải`
    case 'not_installed':
      return 'Chưa cài Ollama trên máy'
    case 'not_running':
      return 'Đã cài nhưng chưa khởi động được'
    case 'no_model':
      return 'Đang chạy nhưng chưa tải model nào'
    case 'error':
      return `Lỗi: ${status.message}`
  }
}

function claudeStatusText(status: ReturnType<typeof useAiAvailability>['data']): string {
  if (!status) return 'Đang kiểm tra...'
  switch (status.status) {
    case 'ready':
      return `Đã đăng nhập${status.email ? ` (${status.email})` : ''}`
    case 'not_found':
      return 'Chưa cài Claude Code CLI'
    case 'not_logged_in':
      return 'Chưa đăng nhập — chạy lệnh claude một lần'
    case 'error':
      return `Lỗi: ${status.message}`
  }
}

function SettingsPage(): React.JSX.Element {
  const [theme, setTheme] = useTheme()

  const claudeQuery = useAiAvailability()
  const ollamaQuery = useOllamaStatus()
  const settingsQuery = useAiSettings()
  const setSettings = useSetAiSettings()

  const models = ollamaQuery.data?.status === 'ready' ? ollamaQuery.data.models : []
  const settings = settingsQuery.data

  return (
    <div className="settings-page">
      <h1>Cài đặt</h1>

      <section className="settings-section">
        <h3>Giao diện</h3>
        <div className="theme-options">
          <button
            type="button"
            className={`theme-option${theme === 'dark' ? ' theme-option-active' : ''}`}
            onClick={() => setTheme('dark')}
          >
            <Moon size={18} />
            Dark Mode
          </button>
          <button
            type="button"
            className={`theme-option${theme === 'light' ? ' theme-option-active' : ''}`}
            onClick={() => setTheme('light')}
          >
            <Sun size={18} />
            Light Mode
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>AI soạn câu hỏi</h3>

        <div className="settings-ai-row">
          <div className="settings-ai-engine">
            <Cpu size={16} /> <strong>Ollama (máy)</strong>
            <button
              type="button"
              className="btn-secondary btn-tiny"
              onClick={() => ollamaQuery.refetch()}
              disabled={ollamaQuery.isFetching}
            >
              <RefreshCw size={12} /> Kiểm tra
            </button>
          </div>
          <p className="settings-ai-status">{ollamaStatusText(ollamaQuery.data)}</p>
        </div>

        <label className="settings-field">
          Model mặc định:
          <select
            value={settings?.ollamaModel ?? ''}
            disabled={!settings}
            onChange={(e) => setSettings.mutate({ ollamaModel: e.target.value })}
          >
            {settings && !models.includes(settings.ollamaModel) && (
              <option value={settings.ollamaModel}>{settings.ollamaModel} (chưa tải)</option>
            )}
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-field settings-field--check">
          <input
            type="checkbox"
            checked={settings?.ollamaRefineWithClaude ?? true}
            disabled={!settings}
            onChange={(e) =>
              setSettings.mutate({ ollamaRefineWithClaude: e.target.checked })
            }
          />
          Sau khi Ollama soạn, để Claude rà soát &amp; sửa — Ollama học theo (tốn ít token
          Claude). Tắt để chạy hoàn toàn offline bằng máy.
        </label>

        <label className="settings-field settings-field--check">
          <input
            type="checkbox"
            checked={settings?.ollamaUseLearnedExamples ?? true}
            disabled={!settings}
            onChange={(e) =>
              setSettings.mutate({ ollamaUseLearnedExamples: e.target.checked })
            }
          />
          Cho Ollama học từ ngân hàng câu hỏi — đưa các câu Claude đã tạo/sửa, câu bạn đã
          chỉnh và câu bạn đánh dấu &quot;làm mẫu tốt&quot; vào prompt (chất lượng tốt hơn,
          soạn chậm hơn một chút)
        </label>

        <label className="settings-field settings-field--check">
          <input
            type="checkbox"
            checked={settings?.ollamaAutoRefine ?? false}
            disabled={!settings}
            onChange={(e) => setSettings.mutate({ ollamaAutoRefine: e.target.checked })}
          />
          Khi KHÔNG dùng Claude sửa: chạy thêm lượt Ollama tự &quot;rà soát &amp; sửa&quot;
          (chậm hơn nhiều, đỡ hơn một chút)
        </label>

        <div className="settings-ai-row">
          <div className="settings-ai-engine">
            <Cloud size={16} /> <strong>Claude Code CLI</strong>
          </div>
          <p className="settings-ai-status">{claudeStatusText(claudeQuery.data)}</p>
        </div>
      </section>
    </div>
  )
}

export default SettingsPage
