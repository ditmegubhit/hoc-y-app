import { useState } from 'react'
import { GraduationCap } from 'lucide-react'
import TopicTree from './components/tree/TopicTree'
import LessonWorkspacePage from './pages/LessonWorkspacePage'
import TopicWorkspacePage from './pages/TopicWorkspacePage'
import SearchResultsPage from './pages/SearchResultsPage'
import HomePage from './pages/HomePage'
import SearchBar from './components/search/SearchBar'

type View = 'home' | 'lesson' | 'topic'

function App(): React.JSX.Element {
  const [view, setView] = useState<View>('home')
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')

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

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <button type="button" className="app-logo" onClick={goHome}>
          <GraduationCap size={20} />
          <span>Học Y</span>
        </button>
        <TopicTree
          selectedLessonId={selectedLessonId}
          onSelectLesson={handleSelectLesson}
          onSelectTopic={handleSelectTopic}
        />
      </aside>
      <main className="app-main">
        <SearchBar value={searchKeyword} onChange={setSearchKeyword} />
        {searchKeyword.trim() ? (
          <SearchResultsPage keyword={searchKeyword} onSelectLesson={handleSelectLesson} />
        ) : view === 'lesson' ? (
          <LessonWorkspacePage lessonId={selectedLessonId} />
        ) : view === 'topic' && selectedTopicId ? (
          <TopicWorkspacePage
            topicId={selectedTopicId}
            onSelectTopic={handleSelectTopic}
            onSelectLesson={handleSelectLesson}
          />
        ) : (
          <HomePage onSelectLesson={handleSelectLesson} />
        )}
      </main>
    </div>
  )
}

export default App
