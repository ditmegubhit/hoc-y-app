import { useState } from 'react'
import TopicTree from './components/tree/TopicTree'
import LessonWorkspacePage from './pages/LessonWorkspacePage'

function App(): React.JSX.Element {
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <TopicTree selectedLessonId={selectedLessonId} onSelectLesson={setSelectedLessonId} />
      </aside>
      <main className="app-main">
        <LessonWorkspacePage lessonId={selectedLessonId} />
      </main>
    </div>
  )
}

export default App
