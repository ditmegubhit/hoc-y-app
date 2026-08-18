import { useEffect, useMemo, useRef, useState } from 'react'
import { Tree } from 'react-arborist'
import { Folder, FolderOpen, FileText, FolderPlus, FilePlus, Pencil, Trash2, Plus } from 'lucide-react'
import type {
  NodeApi,
  TreeApi,
  CreateHandler,
  RenameHandler,
  DeleteHandler,
  MoveHandler,
  NodeRendererProps
} from 'react-arborist'
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

function EditInput({ node }: { node: NodeApi<TreeNode> }): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <input
      ref={inputRef}
      defaultValue={node.data.name}
      className="tree-edit-input"
      onClick={(e) => e.stopPropagation()}
      onBlur={() => node.reset()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') node.reset()
        if (e.key === 'Enter') node.submit(inputRef.current?.value || '')
      }}
    />
  )
}

function TreeNodeRow({ node, style, dragHandle }: NodeRendererProps<TreeNode>): React.JSX.Element {
  return (
    <div
      ref={dragHandle}
      style={style}
      className={`tree-row${node.isSelected ? ' tree-row-selected' : ''}`}
      onClick={() => {
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
      {node.isEditing ? (
        <EditInput node={node} />
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
                node.tree.create({ type: 'internal', parentId: node.id })
              }}
            >
              <FolderPlus size={14} />
            </button>
            <button
              type="button"
              title="Thêm bài học"
              onClick={(e) => {
                e.stopPropagation()
                node.tree.create({ type: 'leaf', parentId: node.id })
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
            node.edit()
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
  const treeRef = useRef<TreeApi<TreeNode> | undefined>(undefined)

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

  const onCreate: CreateHandler<TreeNode> = async ({ parentId, type }) => {
    if (type === 'internal') {
      const topic = await createTopic.mutateAsync({ parentId, name: 'Chủ đề mới' })
      return { id: topic.id, name: topic.name, kind: 'topic', children: [] }
    }
    if (!parentId) return null
    const lesson = await createLesson.mutateAsync({ topicId: parentId, title: 'Bài học mới' })
    return { id: lesson.id, name: lesson.title, kind: 'lesson' }
  }

  const onRename: RenameHandler<TreeNode> = async ({ id, name, node }) => {
    if (node.data.kind === 'topic') {
      await updateTopic.mutateAsync({ id, name })
    } else {
      await updateLesson.mutateAsync({ id, title: name })
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
          onClick={() => treeRef.current?.create({ type: 'internal', parentId: null })}
          title="Thêm chủ đề gốc"
        >
          <Plus size={14} /> Chủ đề
        </button>
      </div>
      <div className="topic-tree-body" ref={containerRef}>
        {size.height > 0 && (
          <Tree<TreeNode>
            ref={treeRef}
            data={data}
            idAccessor="id"
            childrenAccessor="children"
            width={size.width}
            height={size.height}
            rowHeight={30}
            indent={18}
            openByDefault={false}
            selection={selectedLessonId ?? undefined}
            onCreate={onCreate}
            onRename={onRename}
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
        )}
      </div>
    </div>
  )
}

export default TopicTree
