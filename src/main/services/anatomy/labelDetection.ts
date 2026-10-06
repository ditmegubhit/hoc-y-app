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

/** Group detector fragments and PDF text items using local character size.
 * Applying the same pass to OCR and PDF labels also joins wrapped typed labels.
 * Nearby labels remain separate when their gap/alignment is not a continuation. */
export function clusterLabelFragments(fragments: LabelCluster[]): LabelCluster[] {
  const height = (box: Rect): number => Math.max(1, box.y1 - box.y0)
  const width = (box: Rect): number => Math.max(1, box.x1 - box.x0)
  const hasSeveralWords = (text: string): boolean => text.trim().split(/\s+/u).length >= 2
  const join = (a: LabelCluster, b: LabelCluster, vertical: boolean): LabelCluster => {
    const [first, second] = vertical
      ? (a.box.y0 <= b.box.y0 ? [a, b] : [b, a])
      : (a.box.x0 <= b.box.x0 ? [a, b] : [b, a])
    // PDF text layers may split one Vietnamese syllable into several items.
    const adjacentGlyphs = !vertical && first.coordSpace === 'pdf_point' && second.coordSpace === 'pdf_point' &&
      second.box.x0 - first.box.x1 < Math.min(height(first.box), height(second.box)) * 0.18 &&
      !/\s$/.test(first.text) && !/^\s/.test(second.text)
    const weights = [Math.max(1, a.text.trim().length), Math.max(1, b.text.trim().length)]
    const confidence = a.confidence == null || b.confidence == null ? null :
      (a.confidence * weights[0] + b.confidence * weights[1]) / (weights[0] + weights[1])
    return { box: unionRect(a.box, b.box), text: `${first.text.trim()}${adjacentGlyphs ? '' : ' '}${second.text.trim()}`,
      coordSpace: a.coordSpace, confidence }
  }
  let lines = fragments.filter((fragment) => fragment.box.x1 > fragment.box.x0 && fragment.box.y1 > fragment.box.y0)
    .map((fragment) => ({ ...fragment }))
    .sort((a, b) => a.box.x0 - b.box.x0)
  // Restart after each merge so a bridging middle fragment connects both ends.
  let changed = true
  while (changed) {
    changed = false
    outer: for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const a = lines[i]; const b = lines[j]
        if (a.coordSpace !== b.coordSpace) continue
        const localHeight = Math.min(height(a.box), height(b.box))
        if (Math.max(height(a.box), height(b.box)) > localHeight * 1.8) continue
        const overlapY = Math.min(a.box.y1, b.box.y1) - Math.max(a.box.y0, b.box.y0)
        const gapX = Math.max(a.box.x0, b.box.x0) - Math.min(a.box.x1, b.box.x1)
        // Detector lines containing several words are often complete nearby
        // annotations. Join them only when almost touching, not across a gutter.
        if (hasSeveralWords(a.text) && hasSeveralWords(b.text) && gapX > localHeight * 0.25) continue
        if (overlapY < localHeight * 0.5 || gapX > localHeight * 1.15 || gapX < -Math.min(width(a.box), width(b.box)) * 0.5) continue
        lines[i] = join(a, b, false); lines.splice(j, 1); changed = true; break outer
      }
    }
  }
  // Keep individual line heights when joining wrapped labels: a tall merged box
  // must not increase the gap allowed to the next independent annotation.
  let blocks = lines.sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0)
    .map((line) => ({ line, lineHeight: height(line.box), count: 1 }))
  changed = true
  while (changed) {
    changed = false
    outer: for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i]; const b = blocks[j]
        if (a.line.coordSpace !== b.line.coordSpace || a.count + b.count > 4) continue
        const h = Math.min(a.lineHeight, b.lineHeight)
        if (Math.max(a.lineHeight, b.lineHeight) > h * 1.8) continue
        const xOverlap = Math.min(a.line.box.x1, b.line.box.x1) - Math.max(a.line.box.x0, b.line.box.x0)
        const gapY = Math.max(a.line.box.y0, b.line.box.y0) - Math.min(a.line.box.y1, b.line.box.y1)
        if (hasSeveralWords(a.line.text) && hasSeveralWords(b.line.text) && gapY > h * 0.25) continue
        const aligned = Math.abs(a.line.box.x0 - b.line.box.x0) <= h * 0.5 ||
          xOverlap >= Math.min(width(a.line.box), width(b.line.box)) * 0.7
        if (!aligned || xOverlap <= 0 || gapY < -h * 0.3 || gapY > h * 0.7) continue
        blocks[i] = { line: join(a.line, b.line, true), lineHeight: h, count: a.count + b.count }
        blocks.splice(j, 1); changed = true; break outer
      }
    }
  }
  return blocks.map((block) => block.line).sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0)
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
  return clusterLabelFragments(words.map((word) => ({
    box: toRenderPixelRect(word, target), text: word.text, coordSpace: word.coordSpace,
    confidence: word.coordSpace === 'pdf_point' ? 1 : null
  })))
}
