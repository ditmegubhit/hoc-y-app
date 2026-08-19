import { useEffect, useRef, useState } from 'react'
import type { SearchResultItem } from '@shared/types/search'

// Phai khop voi HIGHLIGHT_START/END trong src/main/services/search.service.ts
// - ky tu dieu khien lam marker de tach lai doan khop tu khoa.
const HIGHLIGHT_START = ''
const HIGHLIGHT_END = ''

const UNIT_LABEL: Record<string, (index: number) => string> = {
  page: (i) => `Trang ${i}`,
  slide: (i) => `Slide ${i}`,
  docPage: (i) => `Trang ${i} (Word)`,
  image: () => 'Nội dung ảnh',
  note: () => 'Ghi chú bài học'
}

function unitLabel(unitType: string, unitIndex: number): string {
  return (UNIT_LABEL[unitType] ?? (() => unitType))(unitIndex)
}

function renderHighlighted(text: string): React.ReactNode {
  const parts = text.split(new RegExp(`(${HIGHLIGHT_START}[^${HIGHLIGHT_END}]*${HIGHLIGHT_END})`))
  return parts.map((part, i) => {
    if (part.startsWith(HIGHLIGHT_START) && part.endsWith(HIGHLIGHT_END)) {
      return <mark key={i}>{part.slice(1, -1)}</mark>
    }
    return part ? <span key={i}>{part}</span> : null
  })
}

// Lay dung doan text da khop dau tien (co dau chinh xac tu FTS) de dua cho
// Word.Selection.Find - KHONG dung tu khoa tho nguoi dung go (co the thieu dau).
function extractMatchedText(text: string): string {
  const match = new RegExp(`${HIGHLIGHT_START}([^${HIGHLIGHT_END}]*)${HIGHLIGHT_END}`).exec(text)
  return match ? match[1] : ''
}

export interface ViewerItem extends SearchResultItem {
  keyword: string
}

interface SearchResultViewerModalProps {
  item: ViewerItem | null
  onClose: () => void
  onOpenLesson: (lessonId: string) => void
}

function SearchResultViewerModal({
  item,
  onClose,
  onOpenLesson
}: SearchResultViewerModalProps): React.JSX.Element | null {
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [image, setImage] = useState<{ mimeType: string; base64: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!item) return
    let cancelled = false
    setLoading(true)
    setHighlighted(null)
    setImage(null)
    setOpenError(null)

    const loadChunk = window.api.search.getHighlightedChunk({
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      unitType: item.unitType,
      unitIndex: item.unitIndex,
      keyword: item.keyword
    })
    const loadImage =
      item.sourceType === 'attachment'
        ? window.api.attachments.getPageImage({
            attachmentId: item.sourceId,
            unitType: item.unitType,
            unitIndex: item.unitIndex
          })
        : Promise.resolve(null)

    Promise.all([loadChunk, loadImage]).then(([chunk, img]) => {
      if (cancelled) return
      setHighlighted(chunk?.highlighted ?? '')
      setImage(img)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [item])

  useEffect(() => {
    if (!loading && highlighted) {
      contentRef.current?.querySelector('mark')?.scrollIntoView({ block: 'center' })
    }
  }, [loading, highlighted])

  async function handleOpenAtLocation(): Promise<void> {
    if (!item || item.sourceType !== 'attachment') return
    setOpening(true)
    setOpenError(null)
    const matchedText = highlighted ? extractMatchedText(highlighted) : ''
    const result = await window.api.attachments.openAtLocation({
      attachmentId: item.sourceId,
      unitType: item.unitType,
      unitIndex: item.unitIndex,
      matchedText
    })
    setOpening(false)
    if (!result.success) {
      setOpenError(result.message ?? 'Không mở được file.')
    } else if (result.message) {
      // success:true kem message - file da mo nhung buoc nhay vi tri khong
      // kip ap dung (Word/PowerPoint khoi dong cham) - van hien de user biet,
      // khong phai loi cung nhung khong nen im lang.
      setOpenError(result.message)
    }
  }

  if (!item) return null

  return (
    <div className="viewer-overlay" onClick={onClose}>
      <div className="viewer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-header">
          <div>
            <strong>{item.lessonTitle}</strong>
            <span className="viewer-unit-label">{unitLabel(item.unitType, item.unitIndex)}</span>
          </div>
          <button type="button" onClick={onClose} title="Đóng">
            ✕
          </button>
        </div>

        <div className="viewer-body" ref={contentRef}>
          {loading && <p className="lesson-workspace-empty">Đang tải...</p>}
          {!loading && image && (
            <img
              className="viewer-page-image"
              src={`data:${image.mimeType};base64,${image.base64}`}
              alt={unitLabel(item.unitType, item.unitIndex)}
            />
          )}
          {!loading && (
            <div className="viewer-text">
              {highlighted ? renderHighlighted(highlighted) : 'Không tải được nội dung.'}
            </div>
          )}
        </div>

        {openError && <p className="viewer-error">{openError}</p>}

        <div className="viewer-actions">
          <button type="button" onClick={onClose}>
            Đóng
          </button>
          {item.sourceType === 'attachment' && (
            <button
              type="button"
              className="btn-secondary"
              disabled={opening || loading}
              onClick={handleOpenAtLocation}
            >
              {opening ? 'Đang mở...' : 'Mở file gốc'}
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              onOpenLesson(item.lessonId)
              onClose()
            }}
          >
            Mở bài học
          </button>
        </div>
      </div>
    </div>
  )
}

export default SearchResultViewerModal
