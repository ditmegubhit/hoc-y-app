import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Tree } from 'react-arborist'
import { Folder, FolderOpen, FileText, FolderPlus, FilePlus, Pencil, Trash2, Plus } from 'lucide-react'
import type { DeleteHandler, MoveHandler, NodeRendererProps } from 'react-arborist'
import { useTopics, useCreateTopic, useUpdateTopic, useDeleteTopic } from '@renderer/queries/topics'
import {
  useLessons,
  useCreateLesson,
  useUpdateLesson,
  useDeleteLesson
} from '@renderer/queries/lessons'
import { buildTree, type TreeNode } from './treeUtils'

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, size }
}

// Doi ten VA tao moi KHONG dung co che noi tai cua react-arborist
// (node.edit()/tree.create()/isEditing/submit()/reset()). Thu vien nay, sau
// khi tao xong 1 node, tu dong goi this.focus(data) roi setTimeout(() =>
// this.edit(data)) - chuoi nay co the cuop focus/dispatch edit-state giua
// luc component cua chung ta dang focus o nhap, gay mat ky tu go (da xac
// nhan qua thuc te: doi ten node CO SAN hoat dong dung, chi node VUA TAO
// bi loi - dung khi da khoanh vung ve dung cho tao node cua react-arborist).
// Giai phap: TopicTree tu goi mutation tao/doi ten TRUC TIEP, khong di qua
// tree.create()/node.edit() nua - cat dut hoan toan khoi co che focus/edit
// noi bo cua thu vien. react-arborist chi con dung de: hien thi cay (data),
// keo-tha (onMove), xoa (onDelete, qua node.tree.delete()).
interface EditState {
  id: string
  value: string
}

interface EditContextValue {
  editing: EditState | null
  setValue: (v: string) => void
  commit: () => void
  cancel: () => void
  startEdit: (id: string, currentName: string) => void
  createTopicUnder: (parentId: string | null) => void
  createLessonUnder: (topicId: string) => void
}

const EditContext = createContext<EditContextValue | null>(null)

function useEditContext(): EditContextValue {
  const ctx = useContext(EditContext)
  if (!ctx) throw new Error('EditContext missing')
  return ctx
}

function EditInput({ nodeId }: { nodeId: string }): React.JSX.Element {
  const { editing, setValue, commit, cancel } = useEditContext()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const actionTakenRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const runOnce = (fn: () => void): void => {
    if (actionTakenRef.current) return
    actionTakenRef.current = true
    fn()
  }

  return (
    <input
      ref={inputRef}
      value={editing?.id === nodeId ? editing.value : ''}
      className="tree-edit-input"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => runOnce(commit)}
      onKeyDown={(e) => {
        // Chan phim lan ra container cua cay de tranh phim tat toan cuc cua
        // react-arborist (vd "a"/"A" tao node moi) bat nham trong luc go ten.
        e.stopPropagation()
        if (e.key === 'Escape') runOnce(cancel)
        if (e.key === 'Enter') runOnce(commit)
      }}
    />
  )
}

function TreeNodeRow({ node, style, dragHandle }: NodeRendererProps<TreeNode>): React.JSX.Element {
  const { editing, startEdit, createTopicUnder, createLessonUnder } = useEditContext()
  const isEditingThis = editing?.id === node.id

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`tree-row${node.isSelected ? ' tree-row-selected' : ''}`}
      onClick={() => {
        if (isEditingThis) return
        if (node.isInternal) node.toggle()
      }}
    >
      <span className="tree-icon">
        {node.data.kind === 'topic' ? (
          node.isOpen ? (
            <FolderOpen size={15} />
          ) : (
            <Folder size={15} />
          )
        ) : (
          <FileText size={15} />
        )}
      </span>
      {isEditingThis ? (
        <EditInput nodeId={node.id} />
      ) : (
        <span className="tree-label">{node.data.name}</span>
      )}
      <span className="tree-actions">
        {node.data.kind === 'topic' && (
          <>
            <button
              type="button"
              title="Thêm chủ đề con"
              onClick={(e) => {
                e.stopPropagation()
                // Mo chu de cha truoc - neu dang dong thi node/o nhap vua tao
                // se khong duoc render (an trong thu muc dong), o nhap se
                // "bien mat" ngay sau khi tao trong luc dang go.
                node.open()
                createTopicUnder(node.id)
              }}
            >
              <FolderPlus size={14} />
            </button>
            <button
              type="button"
              title="Thêm bài học"
              onClick={(e) => {
                e.stopPropagation()
                node.open()
                createLessonUnder(node.id)
              }}
            >
              <FilePlus size={14} />
            </button>
          </>
        )}
        <button
          type="button"
          title="Đổi tên"
          onClick={(e) => {
            e.stopPropagation()
            startEdit(node.id, node.data.name)
          }}
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          title="Xoá"
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm(`Xoá "${node.data.name}"?`)) {
              node.tree.delete(node.id)
            }
          }}
        >
          <Trash2 size={13} />
        </button>
      </span>
    </div>
  )
}

interface TopicTreeProps {
  selectedLessonId: string | null
  onSelectLesson: (lessonId: string | null) => void
}

function TopicTree({ selectedLessonId, onSelectLesson }: TopicTreeProps): React.JSX.Element {
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>()
  const [editing, setEditing] = useState<EditState | null>(null)

  const topicsQuery = useTopics()
  const lessonsQuery = useLessons()
  const createTopic = useCreateTopic()
  const updateTopic = useUpdateTopic()
  const deleteTopic = useDeleteTopic()
  const createLesson = useCreateLesson()
  const updateLesson = useUpdateLesson()
  const deleteLesson = useDeleteLesson()

  const data = useMemo(
    () => buildTree(topicsQuery.data ?? [], lessonsQuery.data ?? []),
    [topicsQuery.data, lessonsQuery.data]
  )

  function findKind(id: string): 'topic' | 'lesson' | null {
    if (topicsQuery.data?.some((t) => t.id === id)) return 'topic'
    if (lessonsQuery.data?.some((l) => l.id === id)) return 'lesson'
    return null
  }

  const editContextValue: EditContextValue = {
    editing,
    setValue: (value) => setEditing((prev) => (prev ? { ...prev, value } : prev)),
    startEdit: (id, currentName) => setEditing({ id, value: currentName }),
    cancel: () => setEditing(null),
    commit: () => {
      if (!editing) return
      const { id, value } = editing
      const name = value.trim()
      setEditing(null)
      if (!name) return
      const kind = findKind(id)
      if (kind === 'topic') {
        updateTopic.mutate({ id, name })
      } else if (kind === 'lesson') {
        updateLesson.mutate({ id, title: name })
      }
    },
    createTopicUnder: (parentId) => {
      createTopic.mutate(
        { parentId, name: 'Chủ đề mới' },
        { onSuccess: (topic) => setEditing({ id: topic.id, value: topic.name }) }
      )
    },
    createLessonUnder: (topicId) => {
      createLesson.mutate(
        { topicId, title: 'Bài học mới' },
        { onSuccess: (lesson) => setEditing({ id: lesson.id, value: lesson.title }) }
      )
    }
  }

  const onDelete: DeleteHandler<TreeNode> = async ({ nodes }) => {
    for (const node of nodes) {
      if (node.data.kind === 'topic') {
        await deleteTopic.mutateAsync(node.data.id)
      } else {
        await deleteLesson.mutateAsync(node.data.id)
      }
      if (selectedLessonId === node.data.id) onSelectLesson(null)
    }
  }

  const onMove: MoveHandler<TreeNode> = async ({ dragNodes, parentId, index }) => {
    for (const node of dragNodes) {
      if (node.data.kind === 'topic') {
        await updateTopic.mutateAsync({ id: node.data.id, parentId, sortOrder: index })
      } else if (parentId) {
        await updateLesson.mutateAsync({ id: node.data.id, topicId: parentId, sortOrder: index })
      }
    }
  }

  return (
    <div className="topic-tree">
      <div className="topic-tree-toolbar">
        <strong>Chủ đề &amp; bài học</strong>
        <button
          type="button"
          className="btn-add-topic"
          onClick={() => editContextValue.createTopicUnder(null)}
          title="Thêm chủ đề gốc"
        >
          <Plus size={14} /> Chủ đề
        </button>
      </div>
      <div className="topic-tree-body" ref={containerRef}>
        {size.height > 0 && (
          <EditContext.Provider value={editContextValue}>
            <Tree<TreeNode>
              data={data}
              idAccessor="id"
              childrenAccessor="children"
              width={size.width}
              height={size.height}
              rowHeight={30}
              indent={18}
              openByDefault={false}
              selection={selectedLessonId ?? undefined}
              onDelete={onDelete}
              onMove={onMove}
              onSelect={(nodes) => {
                const lessonNode = nodes.find((n) => n.data.kind === 'lesson')
                onSelectLesson(lessonNode ? lessonNode.data.id : null)
              }}
              disableDrop={({ parentNode, dragNodes }) => {
                // Bai hoc (leaf) khong the chua node con, va khong the tha vao goc cay
                if (parentNode.isRoot) return dragNodes.some((n) => n.data.kind === 'lesson')
                return parentNode.data.kind === 'lesson'
              }}
            >
              {TreeNodeRow}
            </Tree>
          </EditContext.Provider>
        )}
      </div>
    </div>
  )
}

export default TopicTree
