import { useEffect, useRef, useState } from 'react'
import { Paintbrush, Undo2 } from 'lucide-react'
import type { PracticeFile, PracticeRegion } from '@shared/types/practice'
import { resolveRegionMaskColor, resolveRegionMaskOpacity } from '@shared/practice/maskColor'
import ColorPicker from './ColorPicker'
import OpacitySlider from './OpacitySlider'
import type { RegionEditor } from './useRegionEditor'

// Mau rieng + do mo rieng cua vung dang chon/hien hanh. Bang mau mo o dang popover nho.
// Xem truoc ghi thang vao cache (khong goi may chu); chi luu 1 lan khi tha -> 1 thao tac hoan tac.

interface RegionColorControlProps {
  region: PracticeRegion | null
  file: PracticeFile
  recent: readonly string[]
  editor: RegionEditor
  onPushRecent: (hex: string) => void
  /** Cong cu (chon / ve / crop / xem thu) do cha dua vao cuoi the. */
  children?: React.ReactNode
}

interface PopoverPosition {
  left: number
  top: number
}

const POPOVER_WIDTH = 300

export default function RegionColorControl({
  region,
  file,
  recent,
  editor,
  onPushRecent,
  children
}: RegionColorControlProps): React.JSX.Element {
  const [position, setPosition] = useState<PopoverPosition | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)
  // Ban chup vung truoc khi bat dau xem truoc (de hoan tac ve dung gia tri goc).
  const baseRef = useRef<PracticeRegion | null>(null)

  const regionId = region?.id ?? null
  useEffect(() => {
    setPosition(null)
    baseRef.current = null
  }, [regionId])

  const open = position !== null
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      const target = e.target as Node
      if (popRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setPosition(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.stopImmediatePropagation()
      setPosition(null)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const toggleOpen = (): void => {
    if (open) {
      setPosition(null)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8)),
      top: Math.min(rect.bottom + 6, Math.max(8, window.innerHeight - 220))
    })
  }

  if (!region) {
    return (
      <section className="pe-card pe-region-card" aria-label="Màu và độ mờ riêng của vùng">
        <h3 className="pe-card-title">
          <Paintbrush size={13} aria-hidden="true" /> Vùng đang chọn
        </h3>
        <p className="pe-muted">Chọn một vùng để đổi màu / độ mờ riêng.</p>
        {children}
      </section>
    )
  }

  const color = resolveRegionMaskColor(region.colorOverride, file.maskColor)
  const opacity = resolveRegionMaskOpacity(region.opacityOverride, file.maskOpacity)
  const hasColorOverride = region.colorOverride !== null
  const hasOpacityOverride = region.opacityOverride !== null

  const beginPreview = (): void => {
    if (!baseRef.current || baseRef.current.id !== region.id) baseRef.current = region
  }
  const commit = (patch: { colorOverride?: string | null; opacityOverride?: number | null }, label: string): void => {
    const base = baseRef.current && baseRef.current.id === region.id ? baseRef.current : region
    void editor.updateRegion(region, patch, { base, label })
    baseRef.current = null
  }

  return (
    <section className="pe-card pe-region-card" aria-label="Màu và độ mờ riêng của vùng">
      <h3 className="pe-card-title">
        <Paintbrush size={13} aria-hidden="true" /> Vùng đang chọn
      </h3>
      <div className="pe-inline-row is-color">
        <span className="pe-field-label">Màu riêng</span>
        <button
          ref={buttonRef}
          type="button"
          className={`pe-color-btn${open ? ' is-open' : ''}`}
          aria-expanded={open}
          title={hasColorOverride ? 'Đổi màu riêng của vùng này' : 'Đang dùng màu chung; bấm để đặt màu riêng'}
          onClick={toggleOpen}
        >
          <span className="pe-swatch is-static" style={{ background: color }} aria-hidden="true" />
          <span className="pe-color-hex">{color}</span>
          <span className={`pe-tag${hasColorOverride ? ' is-own' : ''}`}>{hasColorOverride ? 'riêng' : 'chung'}</span>
        </button>
        <button
          type="button"
          className="pe-btn is-small"
          disabled={!hasColorOverride && !hasOpacityOverride}
          title="Bỏ màu và độ mờ riêng, về dùng màu / độ mờ chung của file"
          onClick={() => commit({ colorOverride: null, opacityOverride: null }, 'Bỏ màu riêng')}
        >
          <Undo2 size={12} aria-hidden="true" /> Về chung
        </button>
      </div>
      <OpacitySlider
        id="pe-region-opacity"
        label="Độ mờ riêng"
        value={opacity}
        title={hasOpacityOverride ? 'Độ mờ riêng của vùng này' : 'Đang dùng độ mờ chung; kéo để đặt độ mờ riêng'}
        onPreview={(v) => {
          beginPreview()
          editor.preview(region.id, { opacityOverride: v })
        }}
        onCommit={(v) => commit({ opacityOverride: v }, 'Đổi độ mờ riêng')}
      />
      {children}

      {position && (
        <div ref={popRef} className="pe-popover" style={{ left: position.left, top: position.top, width: POPOVER_WIDTH }}>
          <ColorPicker
            idPrefix="pe-region"
            value={color}
            recent={recent}
            onChange={(hex) => {
              beginPreview()
              editor.preview(region.id, { colorOverride: hex })
            }}
            onCommit={(hex) => {
              onPushRecent(hex)
              commit({ colorOverride: hex }, 'Đổi màu riêng')
            }}
          />
        </div>
      )}
    </section>
  )
}
