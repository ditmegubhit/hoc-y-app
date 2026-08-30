import { useState } from 'react'
import { GraduationCap, Settings, FileQuestion } from 'lucide-react'
import TopicTree from './components/tree/TopicTree'
import LessonWorkspacePage from './pages/LessonWorkspacePage'
import TopicWorkspacePage from './pages/TopicWorkspacePage'
import SearchResultsPage from './pages/SearchResultsPage'
import HomePage from './pages/HomePage'
import SettingsPage from './pages/SettingsPage'
import ExamBankPage from './pages/ExamBankPage'
import SearchBar from './components/search/SearchBar'
import ResizeHandle from './components/common/ResizeHandle'
import QuizPlayOverlay from './components/quiz/QuizPlayOverlay'
import QuizLibraryOverlay from './components/quiz/QuizLibraryOverlay'
import type { QuizLaunchRequest, QuizLibraryRequest } from '@shared/types/quiz'

type View = 'home' | 'lesson' | 'topic' | 'settings' | 'examBank'

const SIDEBAR_WIDTH_STORAGE_KEY = 'appSidebarWidth'
const DEFAULT_SIDEBAR_WIDTH = 320
// Cho phep keo hep toi muc chi con thay 1 hang ky tu theo chieu doc (gan
// nhu thu gon) - theo yeu cau cua user, khong con gioi han 240px nhu truoc.
const MIN_SIDEBAR_WIDTH = 40
const MAX_SIDEBAR_WIDTH = 600

function readStoredSidebarWidth(): number {
  const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) ? parsed : DEFAULT_SIDEBAR_WIDTH
}

function App(): React.JSX.Element {
  const [view, setView] = useState<View>('home')
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth)
  const [activeQuiz, setActiveQuiz] = useState<QuizLaunchRequest | null>(null)
  const [activeLibrary, setActiveLibrary] = useState<QuizLibraryRequest | null>(null)

  const handleSidebarWidthChange = (width: number): void => {
    setSidebarWidth(width)
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width))
  }

  const handleSelectLesson = (id: string): void => {
    setSelectedLessonId(id)
    setView('lesson')
    setSearchKeyword('')
  }

  const handleSelectTopic = (id: string): void => {
    setSelectedTopicId(id)
    setView('topic')
    setSearchKeyword('')
  }

  const goHome = (): void => {
    setView('home')
    setSearchKeyword('')
  }

  const handleStartQuiz = (req: QuizLaunchRequest): void => {
    setActiveQuiz(req)
  }

  const handleOpenLibrary = (req: QuizLibraryRequest): void => {
    setActiveLibrary(req)
  }

  return (
    <>
    <div className="app-layout">
      <aside className="app-sidebar" style={{ width: sidebarWidth }}>
        <ResizeHandle
          className="app-sidebar-resize-handle"
          value={sidebarWidth}
          onChange={handleSidebarWidthChange}
          computeNext={(startWidth, dx) =>
            // Sidebar nam ben trai, keo tay cam sang phai (delta duong) lam
            // rong ra - cong dx truc tiep (nguoc dau voi panel file ben phai).
            Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidth + dx))
          }
        />
        <div className="app-sidebar-header">
          <button type="button" className="app-logo" onClick={goHome}>
            <GraduationCap size={20} />
            <span>Học Y</span>
          </button>
          <div className="app-nav-icons">
            <button
              type="button"
              className={view === 'examBank' ? 'app-nav-icon-active' : ''}
              title="Ngân hàng đề thi"
              onClick={() => {
                setView('examBank')
                setSearchKeyword('')
              }}
            >
              <FileQuestion size={17} />
            </button>
            <button
              type="button"
              className={view === 'settings' ? 'app-nav-icon-active' : ''}
              title="Cài đặt"
              onClick={() => {
                setView('settings')
                setSearchKeyword('')
              }}
            >
              <Settings size={17} />
            </button>
          </div>
        </div>
        <TopicTree
          selectedLessonId={selectedLessonId}
          onSelectLesson={handleSelectLesson}
          onSelectTopic={handleSelectTopic}
        />
      </aside>
      <main className="app-main">
        <div className="app-search-row">
          <SearchBar value={searchKeyword} onChange={setSearchKeyword} compact={view === 'lesson'} />
          {/* Dang xem 1 bai hoc (co the dang mo ca cua so file dinh kem) -
              hien ket qua tim kiem dang dropdown NOI DE LEN TREN, khong thay
              the toan bo noi dung, de khong mat giao dien cua so file dinh
              kem dang mo. Cac trang khac (home/topic/...) khong co gi "quy"
              de giu lai nen van thay the toan bo nhu truoc (xem ben duoi). */}
          {view === 'lesson' && searchKeyword.trim() && (
            <div className="app-search-overlay">
              <SearchResultsPage keyword={searchKeyword} onSelectLesson={handleSelectLesson} />
            </div>
          )}
        </div>
        <div className="app-main-content">
          {view === 'lesson' ? (
            <LessonWorkspacePage
              lessonId={selectedLessonId}
              onStartQuiz={handleStartQuiz}
              onOpenLibrary={handleOpenLibrary}
            />
          ) : searchKeyword.trim() ? (
            <SearchResultsPage keyword={searchKeyword} onSelectLesson={handleSelectLesson} />
          ) : view === 'topic' && selectedTopicId ? (
            <TopicWorkspacePage
              topicId={selectedTopicId}
              onSelectTopic={handleSelectTopic}
              onSelectLesson={handleSelectLesson}
              onStartQuiz={handleStartQuiz}
              onOpenLibrary={handleOpenLibrary}
            />
          ) : view === 'settings' ? (
            <SettingsPage />
          ) : view === 'examBank' ? (
            <ExamBankPage />
          ) : (
            <HomePage onSelectLesson={handleSelectLesson} />
          )}
        </div>
      </main>
    </div>
      {activeQuiz && (
        <QuizPlayOverlay request={activeQuiz} onExit={() => setActiveQuiz(null)} />
      )}
      {activeLibrary && (
        <QuizLibraryOverlay request={activeLibrary} onClose={() => setActiveLibrary(null)} />
      )}
    </>
  )
}

export default App
