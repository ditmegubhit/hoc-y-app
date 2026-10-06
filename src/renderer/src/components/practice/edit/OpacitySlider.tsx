import { useRef } from 'react'
import { opacityToPercent, percentToOpacity } from '@shared/practice/editLogic'

// Thanh truot do mo 0-100%: onPreview bao lien tuc khi keo (xem ngay), onCommit chi bao 1 lan
// khi tha chuot / nha phim / roi o (de luu that, gom thanh 1 thao tac hoan tac).

interface OpacitySliderProps {
  id: string
  label: string
  value: number
  disabled?: boolean
  title?: string
  onPreview: (opacity: number) => void
  onCommit: (opacity: number) => void
}

export default function OpacitySlider({
  id,
  label,
  value,
  disabled = false,
  title,
  onPreview,
  onCommit
}: OpacitySliderProps): React.JSX.Element {
  const changedRef = useRef(false)
  const latestRef = useRef(value)
  latestRef.current = value

  const commit = (): void => {
    if (!changedRef.current) return
    changedRef.current = false
    onCommit(latestRef.current)
  }

  const percent = opacityToPercent(value)
  return (
    <div className="pe-inline-row" title={title}>
      <label className="pe-field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="range"
        className="pe-range pe-range-opacity"
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        value={percent}
        onChange={(e) => {
          changedRef.current = true
          const next = percentToOpacity(Number(e.target.value))
          latestRef.current = next
          onPreview(next)
        }}
        onPointerUp={(e) => {
          commit()
          e.currentTarget.blur()
        }}
        onKeyUp={commit}
        onBlur={commit}
      />
      <span className="pe-inline-value">{percent}%</span>
    </div>
  )
}
