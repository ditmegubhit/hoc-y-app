import type { WordPositionRow } from '../../db/repositories/wordPositions.repo'
import type { Rect } from '../../../shared/types/anatomyQuiz'

// Loc "tu" OCR doc duoc tu hoa van/ket cau anh chup (khong phai chu thich
// that) - vd "|", "=", "&", cac ky tu ri le khong co chu cai nao. Chi ap dung
// cho tu nguon OCR ('image_pixel') - tu 'pdf_point' luon la text that lay tu
// PDF nen khong can loc. Van con nhieu OCR-noise khac lot qua duoc bo loc don
// gian nay - man hinh soan cau hoi (nguoi xac nhan/tu choi tung goi y) la
// luoi an toan chinh, bo loc nay chi giam bot cho nguoi soan phai xem.
export function isPlausibleOcrWord(text: string): boolean {
  const letters = text.match(/[\p{L}]/gu) ?? []
  return letters.length >= 2
}

// ============================================================================
// 1. Quy doi toa do word_positions ve pixel-space cua ANH RENDER dung de do.
// ============================================================================

export interface RenderTarget {
  scale: number // RENDER_SCALE dung khi rasterize trang (point -> pixel)
  width: number // pixel, kich thuoc anh render thuc te
  height: number
}

/**
 * word_positions co 2 he toa do (xem migration 007): 'pdf_point' (y-up, lay
 * thang tu item.transform, ref_height = chieu cao trang tinh bang point) va
 * 'image_pixel' (y-down, pixel cua 1 lan render/OCR truoc do, co the khac ty
 * le voi lan render hien tai neu RENDER_SCALE tung doi). Ham nay quy tat ca ve
 * pixel-space cua anh render HIEN TAI (RenderTarget) de sample dung vi tri.
 */
export function toRenderPixelRect(word: WordPositionRow, target: RenderTarget): Rect {
  const { bbox, coordSpace, refWidth, refHeight } = word

  if (coordSpace === 'image_pixel') {
    const s = target.width / refWidth
    return { x0: bbox.x0 * s, y0: bbox.y0 * s, x1: bbox.x1 * s, y1: bbox.y1 * s }
  }

  // pdf_point: refHeight = chieu cao trang (point) tai scale 1. y cua PDF tinh
  // tu day trang len (y-up) - anh render tinh tu tren xuong (y-down) nen phai
  // lat: pixelY = (pageHeightPoint - pdfY) * scale.
  const s = target.scale
  return {
    x0: bbox.x0 * s,
    x1: bbox.x1 * s,
    y0: (refHeight - bbox.y1) * s,
    y1: (refHeight - bbox.y0) * s
  }
}

// ============================================================================
// 2. Gom tu thanh o nhan (label box).
// ============================================================================

export interface LabelCluster {
  box: Rect
  text: string
  coordSpace: 'pdf_point' | 'image_pixel'
  confidence?: number | null
}

interface PixelWord {
  box: Rect
  text: string
  coordSpace: 'pdf_point' | 'image_pixel'
}

// Dung cho buoc 1 (gom tu THANH 1 DONG): 2 tu duoc coi la cung dong neu gan
// truc y VA khong qua xa theo truc x (khoang cach 2 tu lien tiep tren cung 1
// nhan thuong nho hon nhieu lan chieu cao chu; 2 nhan KHAC NHAU dat canh nhau
// ngang hang trong 1 anh giai phau thi thuong cach xa hon rat nhieu).
function isSameLine(a: Rect, b: Rect, xGap: number, yThreshold: number): boolean {
  const xClose = a.x0 - xGap <= b.x1 && b.x0 - xGap <= a.x1
  const yClose = Math.abs(a.y0 - b.y0) <= yThreshold
  return xClose && yClose
}

// Dung cho buoc 2 (gop 2 DONG da gom o buoc 1 lai voi nhau, vd chu thich viet
// tay 2 dong): doi hoi CHONG LAN THAT SU theo truc x (khong chi "gan"), cong
// khoang cach doc rat nho - tranh gop nham 2 nhan khac nhau chi tinh co cung
// gan mep tren duoi nhau.
function isVerticalContinuation(a: Rect, b: Rect, yGap: number): boolean {
  const xOverlap = a.x0 <= b.x1 && b.x0 <= a.x1
  const yClose = Math.abs(a.y1 - b.y0) <= yGap || Math.abs(b.y1 - a.y0) <= yGap
  return xOverlap && yClose
}

function unionRect(a: Rect, b: Rect): Rect {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1)
  }
}

/**
 * Gom toan bo tu tren 1 trang thanh cac o nhan. Buoc 1: gom theo dong (cung do
 * cao ~gan nhau, do gan truc y - giong unionRectsByLine). Buoc 2: gop cac dong
 * ke sat nhau theo chieu doc VA chong lan theo chieu ngang (vd "Niệu quản" +
 * "đoạn bụng" viet 2 dong ngay duoi nhau, cung 1 chu thich) - lap lai toi khi
 * khong gop them duoc nua.
 */
export function clusterWordsIntoLabelBoxes(
  words: WordPositionRow[],
  target: RenderTarget
): LabelCluster[] {
  if (words.length === 0) return []

  const pixelWords: PixelWord[] = words.map((w) => ({
    box: toRenderPixelRect(w, target),
    text: w.text,
    coordSpace: w.coordSpace
  }))

  const heights = pixelWords.map((w) => Math.abs(w.box.y1 - w.box.y0))
  const avgHeight = heights.reduce((a, b) => a + b, 0) / heights.length || 12
  const yThreshold = avgHeight * 0.6 || 5
  // Khoang cach ngang toi da giua 2 tu de con coi la CUNG 1 NHAN/dong - vai
  // lan chieu cao chu la du cho khoang trang/kerning trong 1 cum tu, nhung
  // KHONG du de 2 nhan khac nhau (thuong cach nhau hang tram px) bi gop nham.
  const sameLineXGap = avgHeight * 3

  // Gom tu thanh dong: 1 tu duoc gan vao dong da co NEU gan truc y VA gan
  // truc x VOI IT NHAT 1 tu da co trong dong do (khong chi tu dau tien) - de
  // 1 dong nhieu tu van noi duoc voi nhau ngay ca khi tu dau/cuoi dong cach xa
  // tu o giua.
  const sorted = [...pixelWords].sort((a, b) => a.box.x0 - b.box.x0)
  const lines: PixelWord[][] = []
  for (const w of sorted) {
    const joinLine = lines.find((line) => line.some((existing) => isSameLine(existing.box, w.box, sameLineXGap, yThreshold)))
    if (joinLine) joinLine.push(w)
    else lines.push([w])
  }

  const clusters: LabelCluster[] = lines.map((line) => ({
    box: line.reduce((r, w) => unionRect(r, w.box), line[0].box),
    text: line
      .sort((a, b) => a.box.x0 - b.box.x0)
      .map((w) => w.text)
      .join(' '),
    // Neu 1 dong lan ca 2 nguon (hiem), uu tien pdf_point (typed) vi thuong la
    // nhan chinh; con lai la phu chua.
    coordSpace: line.some((w) => w.coordSpace === 'pdf_point') ? 'pdf_point' : 'image_pixel'
  }))

  // Gop 2 DONG da gom o tren neu chung thuc su la 1 chu thich viet lam 2 dong
  // (vd "Niệu quản" / "đoạn bụng" ngay duoi nhau) - doi hoi CHONG LAN THAT SU
  // theo truc x (khong chi gan), khoang cach doc rat nho. Chi ap dung cho
  // nhan 'image_pixel' (viet tay/OCR) - nhan 'pdf_point' (chu go) hau het da
  // la 1 cum hoan chinh tu 1 item pdf.js, gop them de gay nham nhieu hon loi.
  const yGap = avgHeight * 0.4 || 4
  let merged: LabelCluster[] = [...clusters]
  let mergedAny = true
  while (mergedAny) {
    mergedAny = false
    outer: for (let i = 0; i < merged.length; i++) {
      if (merged[i].coordSpace !== 'image_pixel') continue
      for (let j = 0; j < merged.length; j++) {
        if (i === j || merged[j].coordSpace !== 'image_pixel') continue
        if (isVerticalContinuation(merged[i].box, merged[j].box, yGap)) {
          const [a, b] = merged[i].box.y0 <= merged[j].box.y0 ? [merged[i], merged[j]] : [merged[j], merged[i]]
          const combined: LabelCluster = {
            box: unionRect(a.box, b.box),
            text: `${a.text} ${b.text}`.trim(),
            coordSpace: 'image_pixel'
          }
          merged = merged.filter((_, idx) => idx !== i && idx !== j)
          merged.push(combined)
          mergedAny = true
          break outer
        }
      }
    }
  }

  return merged
}
