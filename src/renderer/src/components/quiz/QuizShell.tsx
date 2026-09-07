import { useState } from 'react'
import { X, List } from 'lucide-react'

interface QuizShellProps {
  title: string
  modeLabel?: string
  timer?: React.ReactNode
  progress?: React.ReactNode
  headerAction?: React.ReactNode
  onExit: () => void
  exitLabel?: string
  sidebar?: React.ReactNode
  children: React.ReactNode
}

function QuizShell({
  title,
  modeLabel,
  timer,
  progress,
  headerAction,
  onExit,
  exitLabel = 'Thoát',
  sidebar,
  children
}: QuizShellProps): React.JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className={`lms-quiz${sidebar ? ' lms-quiz--with-sidebar' : ''}`}>
      <header className="lms-quiz-header">
        <div className="lms-quiz-header-main">
          {sidebar && (
            <button
              type="button"
              className="lms-quiz-drawer-toggle"
              aria-label="Danh sách câu"
              onClick={() => setDrawerOpen((v) => !v)}
            >
              <List size={16} />
            </button>
          )}
          <div className="lms-quiz-titlewrap">
            <h2 className="lms-quiz-title">{title}</h2>
            {modeLabel && <span className="lms-quiz-mode-chip">{modeLabel}</span>}
          </div>
        </div>
        <div className="lms-quiz-header-side">
          {timer}
          {headerAction}
          <button type="button" className="btn-secondary" onClick={onExit}>
            <X size={14} /> {exitLabel}
          </button>
        </div>
        {progress && <div className="lms-quiz-header-progress">{progress}</div>}
      </header>

      <div className="lms-quiz-body">
        {sidebar && (
          <>
            <aside className="lms-quiz-sidebar">{sidebar}</aside>
            {drawerOpen && (
              <div className="lms-quiz-drawer" onClick={() => setDrawerOpen(false)}>
                <div className="lms-quiz-drawer-panel" onClick={(e) => e.stopPropagation()}>
                  {sidebar}
                </div>
              </div>
            )}
          </>
        )}
        <main className="lms-quiz-main">{children}</main>
      </div>
    </div>
  )
}

export default QuizShell
