import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { usePageCount, usePageImage } from '@renderer/queries/attachmentView'
import AnnotationLayer from './AnnotationLayer'
import type { Attachment } from '@shared/types/attachment'

interface PdfImageViewerProps {
  attachment: Attachment
  zoom: number
}

// Kich thuoc "100%" mac dinh cua noi dung - xem ghi chu o AttachmentViewerPanel.tsx
// ve ly do dung kich thuoc co dinh (khong tu co gian theo be rong panel).
export const BASE_CONTENT_WIDTH = 760

function PdfPage({
  attachmentId,
  pageNumber,
  width,
  zoom
}: {
  attachmentId: string
  pageNumber: number
  width: number
  zoom: number
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisible(true)
      },
      { rootMargin: '600px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible])

  const pageImage = usePageImage(attachmentId, 'page', pageNumber, visible)

  return (
    <div ref={ref} className="pdf-viewer-page" style={{ width }}>
      {pageImage.data ? (
        <>
          <img
            className="pdf-viewer-page-img"
            style={{ width }}
            src={`data:${pageImage.data.mimeType};base64,${pageImage.data.base64}`}
            alt={`Trang ${pageNumber}`}
          />
          <AnnotationLayer pageNumber={pageNumber} zoom={zoom} />
        </>
      ) : (
        <div className="pdf-viewer-page-placeholder">
          {visible ? 'Đang tải trang...' : `Trang ${pageNumber}`}
        </div>
      )}
    </div>
  )
}

function ImageViewer({ attachment, zoom }: PdfImageViewerProps): React.JSX.Element {
  const pageImage = usePageImage(attachment.id, 'image', 1, true)

  if (pageImage.isLoading) {
    return <div className="lesson-widget-placeholder">Đang tải ảnh...</div>
  }
  if (!pageImage.data) {
    return <div className="lesson-widget-placeholder">Không tải được ảnh.</div>
  }

  return (
    <div className="pdf-viewer-scroll">
      <div className="pdf-viewer-page" style={{ width: BASE_CONTENT_WIDTH * zoom }}>
        <img
          className="pdf-viewer-image"
          style={{ width: BASE_CONTENT_WIDTH * zoom }}
          src={`data:${pageImage.data.mimeType};base64,${pageImage.data.base64}`}
          alt={attachment.fileName}
        />
        <AnnotationLayer pageNumber={1} zoom={zoom} />
      </div>
    </div>
  )
}

const MULTI_PAGE_TYPES = new Set(['pdf', 'docx', 'pptx'])

function PdfImageViewer({ attachment, zoom }: PdfImageViewerProps): React.JSX.Element {
  const isMultiPage = MULTI_PAGE_TYPES.has(attachment.fileType)
  const pageCountQuery = usePageCount(attachment.id, isMultiPage)

  if (!isMultiPage) {
    return <ImageViewer attachment={attachment} zoom={zoom} />
  }

  if (pageCountQuery.isLoading) {
    return (
      <div className="lesson-widget-placeholder">
        {attachment.fileType === 'pdf'
          ? 'Đang tải file...'
          : 'Đang chuyển đổi để xem trước (có thể mất vài giây)...'}
      </div>
    )
  }

  const pageCount = pageCountQuery.data ?? 0
  if (pageCount === 0) {
    const isOffice = attachment.fileType === 'docx' || attachment.fileType === 'pptx'
    return (
      <div className="viewer-unsupported">
        <p>Không xem trước được nội dung file này.</p>
        {isOffice && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              window.api.attachments.openAtLocation({
                attachmentId: attachment.id,
                unitType: attachment.fileType === 'docx' ? 'docPage' : 'slide',
                unitIndex: 1,
                matchedText: ''
              })
            }
          >
            <ExternalLink size={14} /> Mở bằng ứng dụng gốc
          </button>
        )}
      </div>
    )
  }

  const width = BASE_CONTENT_WIDTH * zoom

  return (
    <div className="pdf-viewer-scroll">
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNumber) => (
        <PdfPage
          key={pageNumber}
          attachmentId={attachment.id}
          pageNumber={pageNumber}
          width={width}
          zoom={zoom}
        />
      ))}
    </div>
  )
}

export default PdfImageViewer
