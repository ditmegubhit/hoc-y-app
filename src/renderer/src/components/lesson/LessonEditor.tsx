import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'

interface LessonEditorProps {
  lessonId: string
  initialContentJson: string | null
  onSave: (notesJson: string, notesText: string) => void
}

function LessonEditor({
  lessonId,
  initialContentJson,
  onSave
}: LessonEditorProps): React.JSX.Element {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const editor = useEditor(
    {
      extensions: [StarterKit],
      content: initialContentJson ? JSON.parse(initialContentJson) : '',
      onUpdate: ({ editor: e }) => {
        if (saveTimer.current) clearTimeout(saveTimer.current)
        // Debounce 800ms de tranh ghi DB lien tuc khi go phim
        saveTimer.current = setTimeout(() => {
          onSave(JSON.stringify(e.getJSON()), e.getText())
        }, 800)
      }
    },
    [lessonId]
  )

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  if (!editor) return <div className="lesson-editor-loading">Đang tải trình soạn thảo...</div>

  return (
    <div className="lesson-editor">
      <EditorContent editor={editor} />
    </div>
  )
}

export default LessonEditor
