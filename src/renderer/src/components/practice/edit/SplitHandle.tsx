import { useRef, useState } from 'react'
import {
  DEFAULT_SPLIT_RATIO,
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  clampSplitRatio,
  splitRatioFromPointer
} from '@shared/practice/editLogic'

// Thanh keo chia doc giua hop thoai (tren) va trang (duoi). Keo bang chuot hoac phim mui ten
// khi dang focus; bam doi de ve ti le mac dinh 1/4 - 3/4.

interface SplitHandleProps {
  ratio: number
  containerRef: React.RefObject<HTMLDivElement | null>
  onChange: (ratio: number) => void
  onCommit: (ratio: number) => void
}

const KEY_STEP = 0.02

export default function SplitHandle({ ratio, containerRef, onChange, onCommit }: SplitHandleProps): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const latestRatio = useRef(ratio)
  latestRatio.current = ratio

  const ratioAt = (clientY: number): number => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return latestRatio.current
    return splitRatioFromPointer(clientY, rect.top, rect.height)
  }

  return (
    <div
      className={`pe-splitter${dragging ? ' is-dragging' : ''}`}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Kéo để đổi tỉ lệ giữa hộp thoại và trang (bấm đúp: về 1/4)"
      aria-valuemin={Math.round(MIN_SPLIT_RATIO * 100)}
      aria-valuemax={Math.round(MAX_SPLIT_RATIO * 100)}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      title="Kéo để đổi tỉ lệ (bấm đúp: về 1/4 - 3/4)"
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
      }}
      onPointerMove={(e) => {
        if (dragging) onChange(ratioAt(e.clientY))
      }}
      onPointerUp={(e) => {
        if (!dragging) return
        setDragging(false)
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
        onCommit(ratioAt(e.clientY))
      }}
      onPointerCancel={() => setDragging(false)}
      onDoubleClick={() => {
        onChange(DEFAULT_SPLIT_RATIO)
        onCommit(DEFAULT_SPLIT_RATIO)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        e.preventDefault()
        e.stopPropagation()
        const next = clampSplitRatio(latestRatio.current + (e.key === 'ArrowDown' ? KEY_STEP : -KEY_STEP))
        onChange(next)
        onCommit(next)
      }}
    >
      <span className="pe-splitter-grip" aria-hidden="true" />
    </div>
  )
}
