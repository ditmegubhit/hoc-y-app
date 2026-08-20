import { useRef, useState } from 'react'

interface ResizeHandleProps {
  className: string
  value: number
  onChange: (next: number) => void
  computeNext: (startValue: number, deltaX: number) => number
}

// Tay cam keo doi 1 gia tri so (vd chieu rong panel/sidebar) theo chieu
// ngang. computeNext nhan gia tri LUC BAT DAU keo + delta con tro, tu quyet
// dinh dau (+/-) va gioi han min/max - tai su dung duoc cho ca panel ben
// phai (keo trai = rong ra) lan sidebar ben trai (keo phai = rong ra).
function ResizeHandle({
  className,
  value,
  onChange,
  computeNext
}: ResizeHandleProps): React.JSX.Element {
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, value: 0 })

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    dragStart.current = { x: e.clientX, value }
    setIsDragging(true)

    const handleMove = (moveEvent: PointerEvent): void => {
      const dx = moveEvent.clientX - dragStart.current.x
      onChange(computeNext(dragStart.current.value, dx))
    }

    const handleUp = (): void => {
      setIsDragging(false)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  return (
    <div
      className={`${className}${isDragging ? ' is-dragging' : ''}`}
      onPointerDown={handlePointerDown}
    />
  )
}

export default ResizeHandle
