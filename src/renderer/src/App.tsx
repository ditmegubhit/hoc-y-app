import { useEffect, useRef, useState } from 'react'
import { GraduationCap, Settings, FileQuestion, ChevronRight } from 'lucide-react'
import TopicTree from './components/tree/TopicTree'
import PracticeTree from './components/practice/PracticeTree'
import PracticeSidebarTabs, { type SidebarTab } from './components/practice/PracticeSidebarTabs'
import PracticeSearchResults from './components/practice/PracticeSearchResults'
import PracticeFilePage from './pages/PracticeFilePage'
import PracticeEmptyPage from './pages/PracticeEmptyPage'
import { usePracticeFilesUpdated } from './queries/practice'
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

type View = 'home' | 'lesson' | 'topic' | 'settings' | 'examBank' | 'practice'

const SIDEBAR_WIDTH_STORAGE_KEY = 'appSidebarWidth'
// Do rong gan nhat > 0 (de mo lai sau khi an han sidebar).
const SIDEBAR_LAST_WIDTH_STORAGE_KEY = 'appSidebarLastWidth'
const SIDEBAR_TAB_STORAGE_KEY = 'appSidebarTab'
const DEFAULT_SIDEBAR_WIDTH = 320
// Cho phep keo hep toi 0 (an han). Keo duoi SNAP_HIDE_WIDTH thi tu "hut" ve 0
// de khong de lai mot sliver khong dung duoc; luc an co tay nam mong o mep
// trai (xem .app-sidebar-reveal / .is-collapsed) de keo hoac bam mo lai.
const MIN_SIDEBAR_WIDTH = 0
const SNAP_HIDE_WIDTH = 80
const MAX_SIDEBAR_WIDTH = 600

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Khong luu duoc thi bo qua - chi mat tinh nang nho.
  }
}

function readStoredSidebarWidth(): number {
  const raw = readStorage(SIDEBAR_WIDTH_STORAGE_KEY)
  const parsed = raw ? Number(raw) : NaN
  if (!Number.isFinite(parsed)) return DEFAULT_SIDEBAR_WIDTH
  if (parsed < SNAP_HIDE_WIDTH) return 0
  return Math.min(MAX_SIDEBAR_WIDTH, parsed)
}

function readStoredLastSidebarWidth(): number {
  const raw = readStorage(SIDEBAR_LAST_WIDTH_STORAGE_KEY)
  const parsed = raw ? Number(raw) : NaN
  if (Number.isFinite(parsed) && parsed >= SNAP_HIDE_WIDTH) return Math.min(MAX_SIDEBAR_WIDTH, parsed)
  // Chua tung luu: dung do rong da luu (neu > 0) hoac mac dinh.
  const current = readStoredSidebarWidth()
  return current > 0 ? current : DEFAULT_SIDEBAR_WIDTH
}

function readStoredSidebarTab(): SidebarTab {
  return readStorage(SIDEBAR_TAB_STORAGE_KEY) === 'practice' ? 'practice' : 'lessons'
}

function App(): React.JSX.Element {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(readStoredSidebarTab)
  const [view, setView] = useState<View>(() => (readStoredSidebarTab() === 'practice' ? 'practice' : 'home'))
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)
  const [selectedPracticeFileId, setSelectedPracticeFileId] = useState<string | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth)
  const lastSidebarWidthRef = useRef(readStoredLastSidebarWidth())
  const [activeQuiz, setActiveQuiz] = useState<QuizLaunchRequest | null>(null)
  const [activeLibrary, setActiveLibrary] = useState<QuizLibraryRequest | null>(null)

  // File thuc hanh doi do dong bo voi file goc -> lam moi cay/file (1 lan o cap ung dung).
  usePracticeFilesUpdated()

  // Nho man hinh khu Bai hoc gan nhat de quay lai khi chuyen tab.
  const lessonsViewRef = useRef<'home' | 'lesson' | 'topic'>('home')
  useEffect(() => {
    if (view === 'home' || view === 'lesson' || view === 'topic') lessonsViewRef.current = view
  }, [view])

  const sidebarCollapsed = sidebarWidth <= 0

  const handleSidebarWidthChange = (width: number): void => {
    const next = width < SNAP_HIDE_WIDTH ? 0 : Math.min(MAX_SIDEBAR_WIDTH, width)
    setSidebarWidth(next)
    writeStorage(SIDEBAR_WIDTH_STORAGE_KEY, String(next))
    if (next > 0) {
      lastSidebarWidthRef.current = next
      writeStorage(SIDEBAR_LAST_WIDTH_STORAGE_KEY, String(next))
    }
  }

  const revealSidebar = (): void => {
    const width = lastSidebarWidthRef.current > 0 ? lastSidebarWidthRef.current : DEFAULT_SIDEBAR_WIDTH
    handleSidebarWidthChange(width)
  }

  // Doi tab ma KHONG dung toi view (dung khi view da duoc dat boi hanh dong chon muc).
  const switchTabOnly = (tab: SidebarTab): void => {
    setSidebarTab(tab)
    writeStorage(SIDEBAR_TAB_STORAGE_KEY, tab)
  }

  // Bam tab: doi cay ben trai va khung ben phai theo tab. Lua chon cua tab con
  // lai (bai hoc/file dang chon) duoc giu nguyen trong state.
  const handleChangeSidebarTab = (tab: SidebarTab): void => {
    switchTabOnly(tab)
    setSearchKeyword('')
    if (tab === 'practice') {
      setView('practice')
    } else if (view === 'practice') {
      setView(lessonsViewRef.current)
    }
  }

  const handleSelectLesson = (id: string): void => {
    setSelectedLessonId(id)
    setView('lesson')
    setSearchKeyword('')
    if (sidebarTab !== 'lessons') switchTabOnly('lessons')
  }

  const handleSelectTopic = (id: string): void => {
    setSelectedTopicId(id)
    setView('topic')
    setSearchKeyword('')
    if (sidebarTab !== 'lessons') switchTabOnly('lessons')
  }

  const handleSelectPracticeFile = (id: string): void => {
    setSelectedPracticeFileId(id)
    setView('practice')
    setSearchKeyword('')
    if (sidebarTab !== 'practice') switchTabOnly('practice')
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

  const inPractice = view === 'practice'
  const hasKeyword = searchKeyword.trim().length > 0
  const practiceSearching = sidebarTab === 'practice' && hasKeyword
  const lessonsSearching = sidebarTab === 'lessons' && hasKeyword

  return (
    <>
    <div className="app-layout">
      <aside
        className={`app-sidebar${sidebarCollapsed ? ' is-collapsed' : ''}`}
        style={{ width: sidebarWidth }}
      >
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
        {sidebarCollapsed && (
          <button
            type="button"
            className="app-sidebar-reveal"
            title="Mở thanh bên (hoặc kéo mép trái ra)"
            aria-label="Mở thanh bên"
            onClick={revealSidebar}
          >
            <ChevronRight size={14} />
          </button>
        )}
        <div className="app-sidebar-inner">
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
          <PracticeSidebarTabs value={sidebarTab} onChange={handleChangeSidebarTab} />
          {/* Ca hai cay luon duoc giu mount (an bang visibility) de khong mat
              trang thai mo/dong thu muc va vi tri cuon khi chuyen tab. */}
          <div className="app-sidebar-tree-slot">
            <div className={`app-sidebar-pane${sidebarTab === 'lessons' ? '' : ' is-hidden'}`}>
              <TopicTree
                selectedLessonId={selectedLessonId}
                onSelectLesson={handleSelectLesson}
                onSelectTopic={handleSelectTopic}
              />
            </div>
            <div className={`app-sidebar-pane${sidebarTab === 'practice' ? '' : ' is-hidden'}`}>
              <PracticeTree
                selectedFileId={selectedPracticeFileId}
                onSelectFile={handleSelectPracticeFile}
                onSelectedFileRemoved={() => setSelectedPracticeFileId(null)}
              />
            </div>
          </div>
        </div>
      </aside>
      <main className="app-main">
        <div className="app-search-row">
          <SearchBar
            value={searchKeyword}
            onChange={setSearchKeyword}
            compact={view === 'lesson' || inPractice}
            placeholder={sidebarTab === 'practice' ? 'Tìm theo tên file hoặc thư mục thực hành…' : undefined}
          />
          {/* Dang xem 1 bai hoc (co the dang mo ca cua so file dinh kem) -
              hien ket qua tim kiem dang dropdown NOI DE LEN TREN, khong thay
              the toan bo noi dung, de khong mat giao dien cua so file dinh
              kem dang mo. Cac trang khac (home/topic/...) khong co gi "quy"
              de giu lai nen van thay the toan bo nhu truoc (xem ben duoi).
              Tab Thuc hanh GP: luon dang dropdown (tim theo ten file/thu muc)
              de khong mat file dang xem. */}
          {view === 'lesson' && lessonsSearching && (
            <div className="app-search-overlay">
              <SearchResultsPage keyword={searchKeyword} onSelectLesson={handleSelectLesson} />
            </div>
          )}
          {practiceSearching && (
            <div className="app-search-overlay">
              <PracticeSearchResults keyword={searchKeyword} onSelectFile={handleSelectPracticeFile} />
            </div>
          )}
        </div>
        <div className={`app-main-content${inPractice ? ' is-practice' : ''}`}>
          {inPractice ? (
            selectedPracticeFileId ? (
              <PracticeFilePage key={selectedPracticeFileId} fileId={selectedPracticeFileId} />
            ) : (
              <PracticeEmptyPage />
            )
          ) : view === 'lesson' ? (
            <LessonWorkspacePage
              lessonId={selectedLessonId}
              onStartQuiz={handleStartQuiz}
              onOpenLibrary={handleOpenLibrary}
            />
          ) : lessonsSearching ? (
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
