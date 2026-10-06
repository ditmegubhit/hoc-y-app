import { useMemo } from 'react'
import { X } from 'lucide-react'
import { usePageImage } from '@renderer/queries/attachmentView'
import type { PracticeRegion, Rect } from '@shared/types/practice'
import { scaleRect } from '@shared/practice/editLogic'
import { resolveRegionMaskColor } from '@shared/practice/maskColor'

// "Xem thu cau hoi": cau hoi se trong the nao luc thi - MOI vung cua trang che DUC 100% bang
// mau that (mau rieng ?? mau chung), vien do dut net quanh vung can hoi, cat theo khung crop neu co.

interface QuestionPreviewProps {
  fileId: string
  target: PracticeRegion
  pageRegions: PracticeRegion[]
  fileMaskColor: string
  onClose: () => void
}

export default function QuestionPreview({
  fileId,
  target,
  pageRegions,
  fileMaskColor,
  onClose
}: QuestionPreviewProps): React.JSX.Element {
  const pageImage = usePageImage(fileId, 'page', target.pageNumber, true)
  const href = useMemo(
    () => (pageImage.data ? `data:${pageImage.data.mimeType};base64,${pageImage.data.base64}` : null),
    [pageImage.data]
  )

  const refW = target.refWidth
  const refH = target.refHeight
  const crop: Rect = target.cropBox ?? { x0: 0, y0: 0, x1: refW, y1: refH }
  const width = Math.max(1, crop.x1 - crop.x0)
  const height = Math.max(1, crop.y1 - crop.y0)
  const targetBox = scaleRect(target.labelBox, target.refWidth, target.refHeight, refW, refH)

  return (
    <div className="pe-preview" role="dialog" aria-label="Xem thử câu hỏi">
      <div className="pe-preview-bar">
        <strong>Xem thử câu hỏi</strong>
        <span className="pe-muted">
          Như lúc thi: mọi ô che đục 100%, viền đỏ đứt nét là vùng được hỏi
          {target.cropBox ? ' · đang cắt theo khung crop' : ''}
        </span>
        <button type="button" className="pe-btn is-small" onClick={onClose} title="Đóng (Esc)">
          <X size={13} /> Đóng
        </button>
      </div>
      <div className="pe-preview-stage">
        {pageImage.isError ? (
          <p className="pe-muted">Không tải được ảnh trang {target.pageNumber}.</p>
        ) : !href ? (
          <p className="pe-muted">Đang tải ảnh…</p>
        ) : (
          <svg
            className="pe-preview-svg"
            viewBox={`${crop.x0} ${crop.y0} ${width} ${height}`}
            role="img"
            aria-label={`Trang ${target.pageNumber}, vùng được hỏi khoanh viền đỏ đứt nét`}
          >
            <image href={href} x="0" y="0" width={refW} height={refH} preserveAspectRatio="none" />
            {pageRegions.map((region) => {
              const box = scaleRect(region.labelBox, region.refWidth, region.refHeight, refW, refH)
              return (
                <rect
                  key={region.id}
                  x={box.x0}
                  y={box.y0}
                  width={Math.max(1, box.x1 - box.x0)}
                  height={Math.max(1, box.y1 - box.y0)}
                  fill={resolveRegionMaskColor(region.colorOverride, fileMaskColor)}
                  fillOpacity={1}
                  stroke="none"
                  shapeRendering="crispEdges"
                />
              )
            })}
            <rect
              x={targetBox.x0}
              y={targetBox.y0}
              width={Math.max(1, targetBox.x1 - targetBox.x0)}
              height={Math.max(1, targetBox.y1 - targetBox.y0)}
              className="pe-target-box"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>
    </div>
  )
}
