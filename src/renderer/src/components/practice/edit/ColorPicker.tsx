import { useEffect, useRef, useState } from 'react'
import { hexToHsv, hsToWheelPoint, hsvToHex, wheelPointToHs, type Hsv } from '@shared/practice/editLogic'
import { normalizeHexColor } from '@shared/practice/maskColor'

// Bang mau hinh tron tu viet (canvas, khong thu vien): banh xe sac do - bao hoa, thanh do sang,
// o nhap ma hex va cac mau gan day. onChange bao moi lan keo (de xem truoc ngay),
// onCommit chi bao khi tha chuot / Enter / chon mau co san (de luu that).

interface ColorWheelProps {
  hsv: Hsv
  size: number
  onChange: (hsv: Hsv) => void
  onCommit: (hsv: Hsv) => void
}

function ColorWheel({ hsv, size, onChange, onCommit }: ColorWheelProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const draggingRef = useRef(false)
  const radius = size / 2

  // Ve banh xe theo do sang hien tai (v) - tra ve toa do pixel that (dpr) de net.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const px = Math.round(size * dpr)
    canvas.width = px
    canvas.height = px
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const image = ctx.createImageData(px, px)
    const r = px / 2
    for (let y = 0; y < px; y += 1) {
      for (let x = 0; x < px; x += 1) {
        const dx = x + 0.5 - r
        const dy = y + 0.5 - r
        const dist = Math.hypot(dx, dy)
        const offset = (y * px + x) * 4
        if (dist > r) {
          image.data[offset + 3] = 0
          continue
        }
        const { h, s } = wheelPointToHs(dx, dy, r)
        const hex = hsvToHex({ h, s, v: hsv.v })
        const n = parseInt(hex.slice(1), 16)
        image.data[offset] = (n >> 16) & 255
        image.data[offset + 1] = (n >> 8) & 255
        image.data[offset + 2] = n & 255
        image.data[offset + 3] = Math.round(255 * Math.min(1, Math.max(0, r - dist)))
      }
    }
    ctx.putImageData(image, 0, 0)
  }, [size, hsv.v])

  const pick = (e: React.PointerEvent<HTMLCanvasElement>): Hsv => {
    const rect = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - rect.left - rect.width / 2
    const dy = e.clientY - rect.top - rect.height / 2
    const { h, s } = wheelPointToHs(dx, dy, rect.width / 2)
    return { h, s, v: hsv.v }
  }

  const marker = hsToWheelPoint(hsv.h, hsv.s, radius)

  return (
    <div className="pe-wheel" style={{ width: size, height: size }}>
      <canvas
        ref={canvasRef}
        className="pe-wheel-canvas"
        style={{ width: size, height: size }}
        aria-label="Bảng màu hình tròn: chọn sắc độ và độ đậm"
        role="img"
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          draggingRef.current = true
          onChange(pick(e))
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) onChange(pick(e))
        }}
        onPointerUp={(e) => {
          if (!draggingRef.current) return
          draggingRef.current = false
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
          onCommit(pick(e))
        }}
        onPointerCancel={() => {
          draggingRef.current = false
        }}
      />
      <span
        className="pe-wheel-marker"
        style={{ left: radius + marker.dx, top: radius + marker.dy, background: hsvToHex(hsv) }}
      />
    </div>
  )
}

export interface ColorPickerProps {
  value: string
  onChange: (hex: string) => void
  onCommit: (hex: string) => void
  recent: readonly string[]
  size?: number
  idPrefix: string
  /** Them hang phia duoi (vd thanh do mo, nut dat lai). */
  children?: React.ReactNode
}

export default function ColorPicker({
  value,
  onChange,
  onCommit,
  recent,
  size = 108,
  idPrefix,
  children
}: ColorPickerProps): React.JSX.Element {
  const normalized = normalizeHexColor(value) ?? '#0a0a0a'
  // Giu sac do/bao hoa khi do sang = 0 hoac bao hoa = 0 (hex mat thong tin do).
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(normalized) ?? { h: 0, s: 0, v: 0.04 })
  const [hexDraft, setHexDraft] = useState<string | null>(null)

  // Dong bo khi gia tri ben ngoai doi (khong phai do chinh minh vua phat ra). Chi xet khi
  // `value` doi that su de khong bao gio lap vo han do sai so lam tron.
  const [syncedHex, setSyncedHex] = useState(normalized)
  if (normalized !== syncedHex) {
    setSyncedHex(normalized)
    if (hsvToHex(hsv) !== normalized) {
      const next = hexToHsv(normalized)
      if (next) setHsv(next)
    }
  }

  const emitChange = (next: Hsv): void => {
    setHsv(next)
    onChange(hsvToHex(next))
  }
  const emitCommit = (next: Hsv): void => {
    setHsv(next)
    onCommit(hsvToHex(next))
  }

  const commitHex = (): void => {
    const draft = hexDraft
    setHexDraft(null)
    if (draft === null) return
    const hex = normalizeHexColor(draft.startsWith('#') ? draft : `#${draft}`)
    if (!hex) return
    const next = hexToHsv(hex)
    if (next) {
      setHsv(next)
      onChange(hex)
      onCommit(hex)
    }
  }

  const hexText = hexDraft ?? normalized
  const hexInvalid = hexDraft !== null && !normalizeHexColor(hexDraft.startsWith('#') ? hexDraft : `#${hexDraft}`)
  const brightEnd = hsvToHex({ h: hsv.h, s: hsv.s, v: 1 })

  return (
    <div className="pe-picker">
      <ColorWheel hsv={hsv} size={size} onChange={emitChange} onCommit={emitCommit} />
      <div className="pe-picker-side">
        <div className="pe-inline-row">
          <label className="pe-field-label" htmlFor={`${idPrefix}-v`}>
            Độ sáng
          </label>
          <input
            id={`${idPrefix}-v`}
            type="range"
            className="pe-range pe-range-value"
            min={0}
            max={100}
            value={Math.round(hsv.v * 100)}
            style={{ background: `linear-gradient(to right, #000, ${brightEnd})` }}
            onChange={(e) => emitChange({ ...hsv, v: Number(e.target.value) / 100 })}
            onPointerUp={(e) => {
              emitCommit({ ...hsv, v: Number(e.currentTarget.value) / 100 })
              e.currentTarget.blur()
            }}
            onKeyUp={(e) => emitCommit({ ...hsv, v: Number(e.currentTarget.value) / 100 })}
          />
          <span className="pe-inline-value">{Math.round(hsv.v * 100)}%</span>
        </div>
        <div className="pe-hex-row">
          <span className="pe-swatch is-static" style={{ background: normalized }} aria-hidden="true" />
          <input
            type="text"
            className={`pe-hex-input${hexInvalid ? ' is-invalid' : ''}`}
            aria-label="Mã màu hex"
            spellCheck={false}
            maxLength={7}
            value={hexText}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={commitHex}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                commitHex()
                e.currentTarget.blur()
              } else if (e.key === 'Escape') {
                e.stopPropagation()
                setHexDraft(null)
                e.currentTarget.blur()
              }
            }}
          />
        </div>
        {recent.length > 0 && (
          <div className="pe-recent" aria-label="Màu dùng gần đây">
            {recent.map((color) => (
              <button
                key={color}
                type="button"
                className={`pe-swatch${color === normalized ? ' is-current' : ''}`}
                style={{ background: color }}
                title={color}
                aria-label={`Dùng màu ${color}`}
                onClick={(e) => {
                  const next = hexToHsv(color)
                  if (next) {
                    setHsv(next)
                    onChange(color)
                    onCommit(color)
                  }
                  e.currentTarget.blur()
                }}
              />
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
