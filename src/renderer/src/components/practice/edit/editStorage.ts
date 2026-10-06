import {
  DEFAULT_SPLIT_RATIO,
  clampSplitRatio,
  parseRecentColors,
  parseSplitRatio
} from '@shared/practice/editLogic'
import type { EditMode } from './editTypes'

// localStorage: chi de nho tien ich cho tung may (che do, ti le chia, mau gan day).
// Moi lan doc/ghi deu boc try/catch - co the bi chan/trong.

const KEY_MODE = 'practice.edit.mode'
const KEY_SPLIT = 'practice.edit.split'
const KEY_RECENT = 'practice.edit.recentColors'

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // bo qua
  }
}

export function loadEditMode(): EditMode {
  return read(KEY_MODE) === 'select' ? 'select' : 'sequence'
}

export function saveEditMode(mode: EditMode): void {
  write(KEY_MODE, mode)
}

export function loadSplitRatio(): number {
  return parseSplitRatio(read(KEY_SPLIT))
}

export function saveSplitRatio(ratio: number): void {
  write(KEY_SPLIT, String(clampSplitRatio(ratio) || DEFAULT_SPLIT_RATIO))
}

export function loadRecentColors(): string[] {
  return parseRecentColors(read(KEY_RECENT))
}

export function saveRecentColors(colors: readonly string[]): void {
  write(KEY_RECENT, JSON.stringify(colors))
}
