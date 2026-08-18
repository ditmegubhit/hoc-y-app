import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Tree } from 'react-arborist'
import { Folder, FolderOpen, FileText, FolderPlus, FilePlus, Trash2, Plus } from 'lucide-react'
import type { DeleteHandler, MoveHandler, NodeRendererProps, TreeApi } from 'react-arborist'
import { useTopics, useCreateTopic, useUpdateTopic, useDeleteTopic } from '@renderer/queries/topics'
import {
  useLessons,
  useCreateLesson,
  useUpdateLesson,
  useDeleteLesson
} from '@renderer/queries/lessons'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'
import { buildTree, type TreeNode } from './treeUtils'

// Cay chi con lam nhiem vu: hien thi + dieu huong + tao moi + xoa + keo-tha.
// Doi ten KHONG con nam trong cay nua (chuyen sang trang lam viec qua
// EditableTitle) - vi o nhap ten song ben trong danh sach ao hoa cua
// react-arborist/react-window tung gay loi mat ky tu go khong the truy ra
// nguyen nhan chac chan du da vai lan vien lai co che edit rieng.
//
// Cac callback dieu huong/tao moi truyen xuong dong qua Context (khong phai
// props/closure inline) de giu component render-prop (`children={TreeNodeRow}`)
// la MOT reference on dinh xuyen suot - dung 1 arrow function inline lam
// children se khien react-arborist coi day la component moi moi lan render,
// gay remount toan bo cac dong.
interface TreeActionsContextValue {
  onSelectTopic: (topicId: string) => void
  onCreateTopicUnder: (parentId: string | null) => void
  onCreateLessonUnder: (topicId: string) => void
  requestDelete: (id: string, name: string) => void
}

const TreeActionsContext = createContext<TreeActionsContextValue | null>(null)

function useTreeActions(): TreeActionsContextValue {
  const ctx = useContext(TreeActionsContext)
  if (!ctx) throw new Error('TreeActionsContext missing')
  return ctx
}

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

function TreeNodeRow({ node, style, dragHandle }: NodeRendererProps<TreeNode>): React.JSX.Element {
  const { onSelectTopic, onCreateTopicUnder, onCreateLessonUnder, requestDelete } =
    useTreeActions()

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`tree-row${node.isSelected ? ' tree-row-selected' : ''}`}
      onClick={() => {
        if (node.data.kind === 'topic') {
          node.toggle()
          onSelectTopic(node.id)
        }
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
      <span className="tree-label">{node.data.name}</span>
      <span className="tree-actions">
        {node.data.kind === 'topic' && (
          <>
            <button
              type="button"
              title="Thêm chủ đề con"
              onClick={(e) => {
                e.stopPropagation()
                node.open()
                onCreateTopicUnder(node.id)
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
                onCreateLessonUnder(node.id)
              }}
            >
              <FilePlus size={14} />
            </button>
          </>
        )}
        <button
          type="button"
          title="Xoá"
          onClick={(e) => {
            e.stopPropagation()
            requestDelete(node.id, node.data.name)
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
  onSelectLesson: (lessonId: string) => void
  onSelectTopic: (topicId: string) => void
}

function TopicTree({
  selectedLessonId,
  onSelectLesson,
  onSelectTopic
}: TopicTreeProps): React.JSX.Element {
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>()
  const treeRef = useRef<TreeApi<TreeNode> | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

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

  // Khong tu dong dieu huong sang trang lam viec ngay sau khi tao: chuoi
  // "tao qua IPC -> dieu huong ngay lap tuc" la dieu kien gay ra loi Chromium
  // lech focus ban phim (input moi chi nhan Backspace/Delete). Tao xong, muc
  // moi xuat hien trong cay (topic cha da duoc mo qua node.open() o duoi),
  // nguoi dung tu bam vao de doi ten khi san sang - tranh han dieu kien gay
  // loi thay vi va no sau do.
  const treeActions: TreeActionsContextValue = {
    onSelectTopic,
    onCreateTopicUnder: (parentId) => {
      createTopic.mutate({ parentId, name: 'Chủ đề mới' })
    },
    onCreateLessonUnder: (topicId) => {
      createLesson.mutate({ topicId, title: 'Bài học mới' })
    },
    // Khong dung window.confirm() - day la nguyen nhan chinh gay loi Chromium
    // mat kha nang go ky tu vao input duoc focus ngay sau do (xem
    // ConfirmDialog.tsx). Dung hop thoai tu ve thay the.
    requestDelete: (id, name) => setPendingDelete({ id, name })
  }

  const onDelete: DeleteHandler<TreeNode> = async ({ nodes }) => {
    for (const node of nodes) {
      if (node.data.kind === 'topic') {
        await deleteTopic.mutateAsync(node.data.id)
      } else {
        await deleteLesson.mutateAsync(node.data.id)
      }
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
          onClick={() => treeActions.onCreateTopicUnder(null)}
          title="Thêm chủ đề gốc"
        >
          <Plus size={14} /> Chủ đề
        </button>
      </div>
      <div className="topic-tree-body" ref={containerRef}>
        {size.height > 0 && (
          <TreeActionsContext.Provider value={treeActions}>
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
              onDelete={onDelete}
              onMove={onMove}
              onSelect={(nodes) => {
                const lessonNode = nodes.find((n) => n.data.kind === 'lesson')
                if (lessonNode) onSelectLesson(lessonNode.data.id)
              }}
              disableDrop={({ parentNode, dragNodes }) => {
                // Bai hoc (leaf) khong the chua node con, va khong the tha vao goc cay
                if (parentNode.isRoot) return dragNodes.some((n) => n.data.kind === 'lesson')
                return parentNode.data.kind === 'lesson'
              }}
            >
              {TreeNodeRow}
            </Tree>
          </TreeActionsContext.Provider>
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Xác nhận xoá"
        message={pendingDelete ? `Xoá "${pendingDelete.name}"?` : ''}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) treeRef.current?.delete(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}

export default TopicTree
