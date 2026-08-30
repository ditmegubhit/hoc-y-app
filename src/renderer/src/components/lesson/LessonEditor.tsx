import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { ImagePlus } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface LessonEditorProps {
  lessonId: string
  initialContentJson: string | null
  onSave: (notesJson: string, notesText: string) => void
}

function fileToDataUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

function LessonEditor({
  lessonId,
  initialContentJson,
  onSave
}: LessonEditorProps): React.JSX.Element {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Ban ghi chua kip luu (dang trong 800ms debounce) - de flush khi unmount
  // (vd: user go xong roi dong ngay phan Ghi chu).
  const pendingSave = useRef<{ json: string; text: string } | null>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  const editor = useEditor(
    {
      extensions: [StarterKit, Image],
      content: initialContentJson ? JSON.parse(initialContentJson) : '',
      onUpdate: ({ editor: e }) => {
        if (saveTimer.current) clearTimeout(saveTimer.current)
        pendingSave.current = { json: JSON.stringify(e.getJSON()), text: e.getText() }
        // Debounce 800ms de tranh ghi DB lien tuc khi go phim
        saveTimer.current = setTimeout(() => {
          const p = pendingSave.current
          if (p) onSaveRef.current(p.json, p.text)
          pendingSave.current = null
        }, 800)
      },
      editorProps: {
        handlePaste: (view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
            f.type.startsWith('image/')
          )
          if (files.length === 0) return false
          event.preventDefault()
          for (const file of files) {
            void fileToDataUrl(file).then((src) => {
              if (!src) return
              view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create({ src })))
            })
          }
          return true
        },
        handleDrop: (view, event) => {
          const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
            f.type.startsWith('image/')
          )
          if (files.length === 0) return false
          event.preventDefault()
          const coords = { left: event.clientX, top: event.clientY }
          const pos = view.posAtCoords(coords)?.pos ?? view.state.selection.from
          for (const file of files) {
            void fileToDataUrl(file).then((src) => {
              if (!src) return
              view.dispatch(view.state.tr.insert(pos, view.state.schema.nodes.image.create({ src })))
            })
          }
          return true
        }
      }
    },
    [lessonId]
  )

  // Flush khi unmount that su (vd: dong phan Ghi chu ngay sau khi go).
  // Effect nay dinh nghia TRUOC effect [lessonId] ben duoi -> cleanup cua no
  // chay truoc khi unmount.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const p = pendingSave.current
      if (p) {
        onSaveRef.current(p.json, p.text)
        pendingSave.current = null
      }
    }
  }, [])

  // Doi bai hoc: bo ban ghi chua luu cua bai cu de KHONG ghi nham sang bai moi.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      pendingSave.current = null
    }
  }, [lessonId])

  if (!editor) return <div className="lesson-editor-loading">Đang tải trình soạn thảo...</div>

  const insertImageFromFile = async (): Promise<void> => {
    const result = await window.api.notes.pickImage()
    if (!result) return
    editor
      .chain()
      .focus()
      .setImage({ src: `data:${result.mimeType};base64,${result.base64}` })
      .run()
  }

  return (
    <div className="lesson-editor">
      <div className="lesson-editor-toolbar">
        <button
          type="button"
          className="lesson-editor-toolbar-btn"
          onClick={() => void insertImageFromFile()}
          title="Chèn ảnh"
        >
          <ImagePlus size={14} /> Chèn ảnh
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

export default LessonEditor
