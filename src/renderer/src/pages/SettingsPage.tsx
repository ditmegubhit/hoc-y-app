import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@renderer/hooks/useTheme'

function SettingsPage(): React.JSX.Element {
  const [theme, setTheme] = useTheme()

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
    </div>
  )
}

export default SettingsPage
