import { useEffect, useRef, useState } from 'react'
import type { EditMode } from './editTypes'

// Nut "?" nho canh chu "Sua dap an": re chuot vao va dung ~1 giay thi hien goc huong dan phim
// tat; re chuot ra thi tat ngay.

const HOVER_DELAY_MS = 1000

interface ShortcutHelpProps {
  mode: EditMode
}

interface Position {
  left: number
  top: number
}

export default function ShortcutHelp({ mode }: ShortcutHelpProps): React.JSX.Element {
  const [position, setPosition] = useState<Position | null>(null)
  const timerRef = useRef<number | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const clearTimer = (): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }
  useEffect(() => clearTimer, [])

  const handleEnter = (): void => {
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = 330
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: rect.bottom + 8
      })
    }, HOVER_DELAY_MS)
  }

  const handleLeave = (): void => {
    clearTimer()
    setPosition(null)
  }

  const seq = mode === 'sequence'
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="pe-help-btn"
        aria-label="Phím tắt (rê chuột vào để xem)"
        onPointerEnter={handleEnter}
        onPointerLeave={handleLeave}
        onPointerDown={handleLeave}
      >
        ?
      </button>
      {position && (
        <div className="pe-help-pop" role="tooltip" style={{ left: position.left, top: position.top }}>
          <p className="pe-help-title">Phím tắt</p>
          <dl>
            <dt>Enter</dt>
            <dd>{seq ? 'Xác nhận, sang vùng kế (hết trang thì sang trang kế)' : 'Xác nhận và bỏ chọn vùng'}</dd>
            <dt>Esc</dt>
            <dd>{seq ? 'Thoát (hỏi nếu đang sửa dở chưa lưu)' : 'Bỏ chọn vùng'}</dd>
            <dt>← →</dt>
            <dd>{seq ? 'Vùng trước / sau, không lưu' : 'Đổi trang'}</dd>
            <dt>Alt + ← →</dt>
            <dd>Như trên, dùng khi con trỏ đang ở trong ô nhập</dd>
            <dt>Delete</dt>
            <dd>Xoá vùng (đang trong ô nhập: Ctrl + Delete)</dd>
            <dt>Ctrl + Z</dt>
            <dd>Hoàn tác thao tác gần nhất</dd>
            <dt>Ctrl + lăn</dt>
            <dd>Phóng to / thu nhỏ trang (chuột giữa để kéo trang)</dd>
          </dl>
        </div>
      )}
    </>
  )
}
