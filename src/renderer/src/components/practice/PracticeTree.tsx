import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Tree } from 'react-arborist'
import {
  Folder,
  FolderOpen,
  FileText,
  FolderPlus,
  FilePlus,
  Trash2,
  Pencil,
  Plus,
  X,
  Loader2
} from 'lucide-react'
import type { DeleteHandler, MoveHandler, NodeRendererProps, TreeApi } from 'react-arborist'
import type { PracticeAddFilesResult, PracticeTreeNode } from '@shared/types/practice'
import {
  useAddPracticeFilesFromPaths,
  useCreatePracticeFolder,
  useDeletePracticeNode,
  useMovePracticeNode,
  usePickAndAddPracticeFiles,
  usePracticeNodes,
  useRenamePracticeNode
} from '@renderer/queries/practice'
import ConfirmDialog from '@renderer/components/common/ConfirmDialog'
import {
  adjustMoveIndex,
  buildPracticeTree,
  collectFileIds,
  type PracticeTreeItem
} from './practiceTreeUtils'

// Cay "Thuc hanh GP": thu muc long nhau khong gioi han, file PDF la la.
// Cach to chuc giong TopicTree.tsx: callback xuong dong qua Context de component
// render-prop (`children={PracticeTreeRow}`) la MOT reference on dinh (tranh
// react-arborist remount toan bo dong). Doi ten tai cho dung o nhap RIENG (state
// cuc bo trong RenameInput, khong dung co che edit cua arborist) va dung
// stopPropagation phim de arborist khong "an" ky tu.

const ROOT_DROP = '__root__'

interface TreeActionsContextValue {
  onOpenFile: (fileId: string) => void
  onAddFolderUnder: (parentId: string | null) => void
  onAddFilesUnder: (parentId: string | null) => void
  requestDelete: (item: PracticeTreeItem) => void
  renamingId: string | null
  startRename: (id: string) => void
  commitRename: (id: string, name: string) => void
  cancelRename: () => void
  // Thu muc dang la dich cua thao tac keo-tha tu Explorer (de to sang).
  dropFolderId: string | null
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

function fileBaseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

// ---------- O nhap ten tai cho ----------

function RenameInput({
  initial,
  onCommit,
  onCancel
}: {
  initial: string
  onCommit: (name: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [value, setValue] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)
  // Enter/Escape da xu ly xong thi blur sau do khong commit/huy lan nua.
  const doneRef = useRef(false)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  const finish = (commit: boolean): void => {
    if (doneRef.current) return
    doneRef.current = true
    if (commit) onCommit(value)
    else onCancel()
  }

  return (
    <input
      ref={inputRef}
      type="text"
      className="tree-edit-input practice-tree-rename"
      value={value}
      maxLength={200}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          finish(true)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          finish(false)
        }
      }}
      onBlur={() => finish(true)}
    />
  )
}

// ---------- Huy hieu trang thai file ----------

function FileBadge({ node }: { node: PracticeTreeNode }): React.JSX.Element | null {
  const file = node.file
  if (!file) return null
  if (file.needsSourceConfirmation) {
    return (
      <span className="practice-badge is-warn" title="File gốc đã đổi, cần xác nhận khi mở file">
        Cần xác nhận
      </span>
    )
  }
  if (file.scanStatus === 'scanning') {
    return (
      <span className="practice-badge is-busy" title="Đang quét đáp án">
        <Loader2 size={11} className="practice-spin" /> Quét
      </span>
    )
  }
  if (file.scanStatus === 'failed') {
    return (
      <span className="practice-badge is-error" title="Lần quét gần nhất bị lỗi">
        Lỗi quét
      </span>
    )
  }
  if (file.scanStatus === 'none' && !file.scanCompleted) {
    return (
      <span className="practice-badge" title="Chưa tạo đáp án cho file này">
        Chưa quét
      </span>
    )
  }
  return (
    <span
      className={`practice-badge${file.confirmedCount > 0 ? ' is-ok' : ''}`}
      title={`${file.confirmedCount} câu đã xác nhận / ${file.regionCount} vùng`}
    >
      {file.confirmedCount} câu
    </span>
  )
}

// ---------- Mot dong cua cay ----------

function PracticeTreeRow({ node, style, dragHandle }: NodeRendererProps<PracticeTreeItem>): React.JSX.Element {
  const {
    onOpenFile,
    onAddFolderUnder,
    onAddFilesUnder,
    requestDelete,
    renamingId,
    startRename,
    commitRename,
    cancelRename,
    dropFolderId
  } = useTreeActions()

  const isFolder = node.data.kind === 'folder'
  const isRenaming = renamingId === node.id
  const isDropTarget = isFolder && dropFolderId === node.id

  return (
    <div
      ref={isRenaming ? undefined : dragHandle}
      style={style}
      data-practice-row=""
      data-node-id={node.id}
      data-node-kind={node.data.kind}
      data-parent-id={node.data.node.parentId ?? ''}
      className={`tree-row practice-tree-row${node.isSelected ? ' tree-row-selected' : ''}${
        isDropTarget ? ' is-drop-target' : ''
      }`}
      onClick={() => {
        if (isRenaming) return
        if (isFolder) node.toggle()
        else onOpenFile(node.id)
      }}
    >
      <span className="tree-icon">
        {isFolder ? node.isOpen ? <FolderOpen size={15} /> : <Folder size={15} /> : <FileText size={15} />}
      </span>
      {isRenaming ? (
        <RenameInput
          initial={node.data.name}
          onCommit={(name) => commitRename(node.id, name)}
          onCancel={cancelRename}
        />
      ) : (
        <span
          className="tree-label"
          title={node.data.name}
          onDoubleClick={(e) => {
            e.stopPropagation()
            startRename(node.id)
          }}
        >
          {node.data.name}
        </span>
      )}
      {!isRenaming && !isFolder && <FileBadge node={node.data.node} />}
      {!isRenaming && (
        <span className="tree-actions">
          {isFolder && (
            <>
              <button
                type="button"
                title="Thêm thư mục con"
                onClick={(e) => {
                  e.stopPropagation()
                  node.open()
                  onAddFolderUnder(node.id)
                }}
              >
                <FolderPlus size={14} />
              </button>
              <button
                type="button"
                title="Thêm file PDF vào thư mục này"
                onClick={(e) => {
                  e.stopPropagation()
                  node.open()
                  onAddFilesUnder(node.id)
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
              startRename(node.id)
            }}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            title="Xoá"
            onClick={(e) => {
              e.stopPropagation()
              requestDelete(node.data)
            }}
          >
            <Trash2 size={13} />
          </button>
        </span>
      )}
    </div>
  )
}

// ---------- Cay ----------

interface PracticeTreeProps {
  selectedFileId: string | null
  onSelectFile: (fileId: string) => void
  // File dang mo bi xoa (truc tiep hoac nam trong thu muc bi xoa).
  onSelectedFileRemoved?: () => void
}

interface Notice {
  kind: 'error' | 'info'
  lines: string[]
}

function hasFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files')
}

function PracticeTree({ selectedFileId, onSelectFile, onSelectedFileRemoved }: PracticeTreeProps): React.JSX.Element {
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>()
  const treeRef = useRef<TreeApi<PracticeTreeItem> | undefined>(undefined)

  const nodesQuery = usePracticeNodes()
  const createFolder = useCreatePracticeFolder()
  const renameNode = useRenamePracticeNode()
  const moveNode = useMovePracticeNode()
  const deleteNode = useDeletePracticeNode()
  const pickFiles = usePickAndAddPracticeFiles()
  const addFromPaths = useAddPracticeFilesFromPaths()

  const nodes = nodesQuery.data
  const data = useMemo(() => buildPracticeTree(nodes ?? []), [nodes])

  const [pendingDelete, setPendingDelete] = useState<PracticeTreeItem | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  // Thu muc "dang chon": dich cua nut "Thu muc"/"Them file". null = goc.
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const activeFolder = useMemo(
    () => (activeFolderId ? (nodes ?? []).find((n) => n.id === activeFolderId) ?? null : null),
    [nodes, activeFolderId]
  )
  // Thu muc dich da bi xoa/di chuyen mat -> ve goc.
  useEffect(() => {
    if (activeFolderId && nodes && !activeFolder) setActiveFolderId(null)
  }, [activeFolderId, activeFolder, nodes])

  // Khi file duoc chon tu ngoai (vd bam ket qua tim kiem) -> mo cac thu muc cha
  // va cuon toi dong do. Chi lam 1 lan cho moi file duoc chon.
  const revealedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedFileId) {
      revealedRef.current = null
      return
    }
    if (revealedRef.current === selectedFileId) return
    const tree = treeRef.current
    if (!tree || !tree.get(selectedFileId)) return
    revealedRef.current = selectedFileId
    tree.openParents(selectedFileId)
    void tree.scrollTo(selectedFileId)
  }, [selectedFileId, data, size.height])

  const reportAddResult = (result: PracticeAddFilesResult, parentId: string | null): void => {
    if (parentId) treeRef.current?.open(parentId)
    if (result.rejected.length > 0) {
      setNotice({
        kind: 'error',
        lines: [
          result.added.length > 0
            ? `Đã thêm ${result.added.length} file. Không thêm được ${result.rejected.length} file:`
            : `Không thêm được ${result.rejected.length} file:`,
          ...result.rejected.map((r) => `${fileBaseName(r.path)} - ${r.reason}`)
        ]
      })
    } else if (result.added.length > 0) {
      setNotice(null)
    }
  }

  const reportError = (error: unknown): void => {
    setNotice({ kind: 'error', lines: [error instanceof Error ? error.message : String(error)] })
  }

  const addFilesUnder = (parentId: string | null): void => {
    pickFiles.mutate(parentId, {
      onSuccess: (result) => reportAddResult(result, parentId),
      onError: reportError
    })
  }

  const addFolderUnder = (parentId: string | null): void => {
    createFolder.mutate(
      { parentId, name: 'Thư mục mới' },
      {
        onSuccess: (folder) => {
          if (parentId) treeRef.current?.open(parentId)
          setRenamingId(folder.id)
          // Hang moi chi co sau khi du lieu cay refetch xong (hook da cho).
          requestAnimationFrame(() => void treeRef.current?.scrollTo(folder.id))
        },
        onError: reportError
      }
    )
  }

  const commitRename = (id: string, name: string): void => {
    setRenamingId(null)
    const trimmed = name.trim()
    const current = (nodes ?? []).find((n) => n.id === id)
    if (!trimmed || !current || trimmed === current.name) return
    renameNode.mutate({ id, name: trimmed }, { onError: reportError })
  }

  const confirmDelete = (): void => {
    const item = pendingDelete
    setPendingDelete(null)
    if (!item) return
    const removedFiles = collectFileIds(nodes ?? [], item.id)
    deleteNode.mutate(item.id, {
      onSuccess: () => {
        if (selectedFileId && removedFiles.includes(selectedFileId)) onSelectedFileRemoved?.()
      },
      onError: reportError
    })
  }

  const treeActions: TreeActionsContextValue = {
    onOpenFile: onSelectFile,
    onAddFolderUnder: addFolderUnder,
    onAddFilesUnder: addFilesUnder,
    requestDelete: (item) => setPendingDelete(item),
    renamingId,
    startRename: setRenamingId,
    commitRename,
    cancelRename: () => setRenamingId(null),
    dropFolderId: dropTarget && dropTarget !== ROOT_DROP ? dropTarget : null
  }

  // Phim Backspace cua arborist goi onDelete - luon di qua hop xac nhan.
  const onDelete: DeleteHandler<PracticeTreeItem> = ({ nodes: deleting }) => {
    const first = deleting[0]
    if (first) setPendingDelete(first.data)
  }

  const onMove: MoveHandler<PracticeTreeItem> = async ({ dragNodes, parentId, index }) => {
    for (const dragged of dragNodes) {
      try {
        await moveNode.mutateAsync({
          id: dragged.id,
          parentId,
          index: adjustMoveIndex(nodes ?? [], dragged.id, parentId, index)
        })
      } catch (error) {
        reportError(error)
        return
      }
    }
  }

  // ----- Keo-tha file tu Explorer -----

  const resolveDropTarget = (target: EventTarget): string => {
    const row = target instanceof Element ? target.closest('[data-practice-row]') : null
    if (!row) return ROOT_DROP
    if (row.getAttribute('data-node-kind') === 'folder') return row.getAttribute('data-node-id') ?? ROOT_DROP
    return row.getAttribute('data-parent-id') || ROOT_DROP
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!hasFiles(e)) return // keo noi bo trong cay do react-arborist xu ly
    e.preventDefault()
    // react-dnd (HTML5 backend) gan listener 'dragover' o window va dat
    // dropEffect='none' khi khong co dich noi bo nao nhan - chan tai day de
    // con tro hien "copy" va su kien drop con toi duoc day.
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    const next = resolveDropTarget(e.target)
    setDropTarget((prev) => (prev === next ? prev : next))
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!hasFiles(e)) return
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!hasFiles(e)) return
    e.preventDefault()
    const target = resolveDropTarget(e.target)
    setDropTarget(null)
    const parentId = target === ROOT_DROP ? null : target
    // Doc FileList dong bo trong su kien (sau do danh sach bi xoa).
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.api.practice.getPathForFile(f))
      .filter((p) => p.length > 0)
    if (paths.length === 0) {
      setNotice({ kind: 'error', lines: ['Không đọc được đường dẫn của file vừa thả.'] })
      return
    }
    addFromPaths.mutate(
      { parentId, paths },
      { onSuccess: (result) => reportAddResult(result, parentId), onError: reportError }
    )
  }

  const busyAdding = pickFiles.isPending || addFromPaths.isPending
  const isEmpty = nodes !== undefined && nodes.length === 0

  return (
    <div className="topic-tree practice-tree">
      <div className="topic-tree-toolbar practice-tree-toolbar">
        <strong>Thực hành GP</strong>
        <div className="practice-tree-toolbar-actions">
          <button
            type="button"
            className="btn-add-topic"
            onClick={() => addFolderUnder(activeFolderId)}
            title={activeFolder ? `Thêm thư mục con trong "${activeFolder.name}"` : 'Thêm thư mục ở gốc'}
          >
            <Plus size={14} /> Thư mục
          </button>
          <button
            type="button"
            className="btn-add-topic"
            disabled={busyAdding}
            onClick={() => addFilesUnder(activeFolderId)}
            title={activeFolder ? `Thêm file PDF vào "${activeFolder.name}"` : 'Thêm file PDF ở gốc'}
          >
            {busyAdding ? <Loader2 size={14} className="practice-spin" /> : <Plus size={14} />} Thêm file
          </button>
        </div>
      </div>

      <div className="practice-tree-target" title="Thư mục nhận thư mục/file mới. Bấm một thư mục trong cây để đổi.">
        <span>Thêm vào:</span>
        <strong>{activeFolder ? activeFolder.name : 'Gốc'}</strong>
        {activeFolder && (
          <button
            type="button"
            className="practice-tree-target-reset"
            title="Về gốc"
            onClick={() => {
              setActiveFolderId(null)
              treeRef.current?.deselectAll()
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {notice && (
        <div className={`practice-tree-notice is-${notice.kind}`} role="status">
          <div className="practice-tree-notice-lines">
            {notice.lines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
          <button type="button" title="Đóng thông báo" onClick={() => setNotice(null)}>
            <X size={13} />
          </button>
        </div>
      )}

      <div
        className={`topic-tree-body practice-tree-body${dropTarget === ROOT_DROP ? ' is-drop-root' : ''}`}
        ref={containerRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isEmpty && (
          <div className="practice-tree-empty">
            <p>Chưa có file nào.</p>
            <p>Bấm &quot;Thêm file&quot; hoặc kéo file PDF từ Explorer thả vào đây.</p>
          </div>
        )}
        {size.height > 0 && (
          <TreeActionsContext.Provider value={treeActions}>
            <Tree<PracticeTreeItem>
              ref={treeRef}
              data={data}
              idAccessor="id"
              childrenAccessor="children"
              width={size.width}
              height={size.height}
              rowHeight={30}
              indent={18}
              openByDefault={false}
              selection={selectedFileId ?? undefined}
              disableMultiSelection
              disableEdit
              onDelete={onDelete}
              onMove={onMove}
              onSelect={(selected) => {
                const first = selected[0]
                if (!first) return
                setActiveFolderId(first.data.kind === 'folder' ? first.id : first.data.node.parentId)
              }}
              disableDrop={({ parentNode }) => !parentNode.isRoot && parentNode.data.kind === 'file'}
            >
              {PracticeTreeRow}
            </Tree>
          </TreeActionsContext.Provider>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Xác nhận xoá"
        message={deleteMessage(pendingDelete, nodes ?? [])}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function deleteMessage(item: PracticeTreeItem | null, nodes: PracticeTreeNode[]): string {
  if (!item) return ''
  const tail = 'Việc này xoá luôn các vùng, đáp án, đề thi và lịch sử làm bài của file. File gốc ngoài app không bị ảnh hưởng.'
  if (item.kind === 'file') return `Xoá file "${item.name}"? ${tail}`
  const count = collectFileIds(nodes, item.id).length
  return count > 0
    ? `Xoá thư mục "${item.name}" cùng ${count} file bên trong? ${tail}`
    : `Xoá thư mục trống "${item.name}"?`
}

export default PracticeTree
