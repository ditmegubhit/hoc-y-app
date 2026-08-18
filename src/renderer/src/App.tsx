import { useState } from 'react'
import { GraduationCap } from 'lucide-react'
import TopicTree from './components/tree/TopicTree'
import LessonWorkspacePage from './pages/LessonWorkspacePage'
import SearchResultsPage from './pages/SearchResultsPage'
import HomePage from './pages/HomePage'
import SearchBar from './components/search/SearchBar'

type View = 'home' | 'lesson'

function App(): React.JSX.Element {
  const [view, setView] = useState<View>('home')
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')

  const handleSelectLesson = (id: string): void => {
    setSelectedLessonId(id)
    setView('lesson')
    setSearchKeyword('')
  }

  const handleTreeSelect = (id: string | null): void => {
    if (id) handleSelectLesson(id)
  }

  const goHome = (): void => {
    setView('home')
    setSearchKeyword('')
  }

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <button type="button" className="app-logo" onClick={goHome}>
          <GraduationCap size={20} />
          <span>Học Y</span>
        </button>
        <TopicTree selectedLessonId={selectedLessonId} onSelectLesson={handleTreeSelect} />
      </aside>
      <main className="app-main">
        <SearchBar value={searchKeyword} onChange={setSearchKeyword} />
        {searchKeyword.trim() ? (
          <SearchResultsPage keyword={searchKeyword} onSelectLesson={handleSelectLesson} />
        ) : view === 'lesson' ? (
          <LessonWorkspacePage lessonId={selectedLessonId} />
        ) : (
          <HomePage onSelectLesson={handleSelectLesson} />
        )}
      </main>
    </div>
  )
}

export default App
