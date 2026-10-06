// Mau/do mo cua lop che. Thuan tuy, dung chung main + renderer.

export const DEFAULT_MASK_COLOR = '#0a0a0a'
export const DEFAULT_MASK_OPACITY = 0.5

const HEX6 = /^#[0-9a-fA-F]{6}$/
const HEX3 = /^#[0-9a-fA-F]{3}$/

/** Tra '#rrggbb' chu thuong, hoac null neu khong phai mau hex hop le (chap nhan #rgb). */
export function normalizeHexColor(value: string | null | undefined): string | null {
  if (!value) return null
  const text = value.trim()
  if (HEX6.test(text)) return text.toLowerCase()
  if (HEX3.test(text)) {
    const [, r, g, b] = text.toLowerCase()
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return null
}

/** Mau che that su cua 1 vung: mau rieng (neu hop le) uu tien hon mau chung cua file. */
export function resolveRegionMaskColor(
  colorOverride: string | null | undefined,
  fileMaskColor: string | null | undefined
): string {
  return normalizeHexColor(colorOverride) ?? normalizeHexColor(fileMaskColor) ?? DEFAULT_MASK_COLOR
}

/** Do mo luc SUA (bai thi luon duc 100% nen khong dung ham nay luc thi). */
export function resolveRegionMaskOpacity(
  opacityOverride: number | null | undefined,
  fileMaskOpacity: number | null | undefined
): number {
  const value = opacityOverride ?? fileMaskOpacity ?? DEFAULT_MASK_OPACITY
  if (!Number.isFinite(value)) return DEFAULT_MASK_OPACITY
  return Math.min(1, Math.max(0, value))
}

// ---- mau doi nghich (nen cho vung nghi rac) ----

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const channel = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** Mau noi bat doi nghich voi mau che: che toi -> vang sang, che sang -> tim dam. */
export function contrastingMarkerColor(maskColor: string): string {
  const hex = normalizeHexColor(maskColor) ?? DEFAULT_MASK_COLOR
  return luminance(hex) < 0.4 ? '#ffd60a' : '#6a1b9a'
}
