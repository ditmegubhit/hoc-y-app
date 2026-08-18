import { useState } from 'react'
import TopicTree from './components/tree/TopicTree'
import LessonWorkspacePage from './pages/LessonWorkspacePage'
import SearchResultsPage from './pages/SearchResultsPage'
import SearchBar from './components/search/SearchBar'

function App(): React.JSX.Element {
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <TopicTree selectedLessonId={selectedLessonId} onSelectLesson={setSelectedLessonId} />
      </aside>
      <main className="app-main">
        <SearchBar value={searchKeyword} onChange={setSearchKeyword} />
        {searchKeyword.trim() ? (
          <SearchResultsPage
            keyword={searchKeyword}
            onSelectLesson={(id) => {
              setSelectedLessonId(id)
              setSearchKeyword('')
            }}
          />
        ) : (
          <LessonWorkspacePage lessonId={selectedLessonId} />
        )}
      </main>
    </div>
  )
}

export default App
