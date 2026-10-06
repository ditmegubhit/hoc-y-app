import termsData from '../../resources/anatomy-terms.json'
import { scoreVietnameseText } from '../ocr-vi/vietnameseSyllable'

// Chi khoi phuc 1 thuat ngu KHOP DUY NHAT. Giu nguyen cac cap mo ho nhu mat/mat,
// than/than de nguoi soan tu xem. Day la tro giup chinh ta, khong suy luan giai phau.
// Danh sach thuat ngu nap tu src/main/resources/anatomy-terms.json (dong goi cung ma nguon
// qua electron-vite) + thuat ngu tu hoc tu dap an da duyet (tham so additionalTerms).

interface TermsFile { groups: Record<string, string[]> }

export function normalizeLabel(text: string): string {
  return text.normalize('NFC').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Khoa so khop: bo dau, bo khoang trang/dau cau, thuong hoa, đ->d. */
export const labelKey = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/đ/g, 'd').replace(/[^\p{L}\p{N}]/gu, '')

const ABBREVIATION_PREFIXES: Array<[string, string]> = [
  ['Động mạch ', 'ĐM '], ['Tĩnh mạch ', 'TM '], ['Dây chằng ', 'DC '], ['Thần kinh ', 'TK ']
]
const SIDE_SUFFIXES = [' trái', ' phải', ' T', ' P']

/** Tu 1 thuat ngu goc sinh them: dang viet tat (ĐM/TM/DC/TK) va hau to trai/phai/T/P. */
export function expandTermVariants(term: string, withSides = true): string[] {
  const base = normalizeLabel(term)
  if (base === '') return []
  const forms = [base]
  for (const [full, abbr] of ABBREVIATION_PREFIXES) {
    if (base.startsWith(full)) forms.push(abbr + base.slice(full.length))
  }
  if (!withSides) return forms
  const out = [...forms]
  for (const form of forms) {
    if (/ (trái|phải|T|P)$/u.test(form)) continue
    for (const suffix of SIDE_SUFFIXES) out.push(form + suffix)
  }
  return out
}

function buildIndex(terms: Iterable<string>, withSides: boolean): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const raw of terms) {
    for (const form of expandTermVariants(raw, withSides)) {
      const k = labelKey(form)
      if (k.length < 2) continue
      const list = index.get(k)
      if (!list) index.set(k, [form])
      else if (!list.includes(form)) list.push(form)
    }
  }
  return index
}

let builtinIndex: Map<string, string[]> | null = null
const builtinIndexOf = (): Map<string, string[]> => {
  if (!builtinIndex) {
    const file = termsData as TermsFile
    builtinIndex = buildIndex(Object.values(file.groups).flat(), true)
  }
  return builtinIndex
}

let lastExtra: { source: readonly string[]; index: Map<string, string[]> } | null = null
const extraIndexOf = (extra: readonly string[]): Map<string, string[]> | null => {
  if (extra.length === 0) return null
  if (lastExtra && lastExtra.source === extra) return lastExtra.index
  const index = buildIndex(extra, false)
  lastExtra = { source: extra, index }
  return index
}

function candidatesFor(compact: string, additionalTerms: readonly string[]): string[] {
  const merged: string[] = [...(builtinIndexOf().get(compact) ?? [])]
  for (const form of extraIndexOf(additionalTerms)?.get(compact) ?? []) if (!merged.includes(form)) merged.push(form)
  return merged
}

const isUpperToken = (token: string): boolean => /^[\p{Lu}]{2,}$/u.test(token)

/** Doi kieu chu hoa/thuong cua thuat ngu cho giong chu doc duoc (HOA het -> HOA, chu thuong dau -> thuong). */
export function matchCase(value: string, term: string): string {
  const letters = value.replace(/[^\p{L}]/gu, '')
  if (letters.length >= 2 && letters === letters.toLocaleUpperCase('vi-VN')) return term.toLocaleUpperCase('vi-VN')
  const first = Array.from(value).find((ch) => /\p{L}/u.test(ch))
  if (first && first === first.toLocaleLowerCase('vi-VN') && first !== first.toLocaleUpperCase('vi-VN')) {
    const firstToken = term.split(' ')[0]
    if (!isUpperToken(firstToken)) return term.charAt(0).toLocaleLowerCase('vi-VN') + term.slice(1)
  }
  return term
}

const lettersOf = (text: string): string[] => Array.from(text.toLocaleLowerCase('vi-VN')).filter((char) => /[\p{L}\p{N}]/u.test(char))

export function suggestVietnameseLabel(text: string, additionalTerms: readonly string[] = []): string | null {
  const value = normalizeLabel(text)
  const compact = labelKey(value)
  if (compact.length < 3) return null
  const matches = candidatesFor(compact, additionalTerms)
  if (matches.length !== 1) return null
  const suggestion = matchCase(value, matches[0])
  if (suggestion === value) return null
  // Do not strip accents already supplied by OCR to choose a different word.
  const originalLetters = lettersOf(value)
  const suggestedLetters = lettersOf(suggestion)
  // Chi khac hoa/thuong hoac dau cau -> khong co dau nao de khoi phuc.
  if (originalLetters.join('') === suggestedLetters.join('')) return null
  if (originalLetters.some((char, index) => /\p{M}/u.test(char.normalize('NFD')) && char !== suggestedLetters[index])) return null
  return suggestion
}

let vocabularyCache: Set<string> | null = null
/** Tu vung giai phau: tung TU (da bo dau/thuong hoa, labelKey) trong thuat ngu nap san + thuat ngu tu hoc.
 * Dung de xet mot cum chu co lien quan giai phau hay khong (lop loc lien quan). */
export function anatomyWordKeys(additionalTerms: readonly string[] = []): Set<string> {
  if (!vocabularyCache) {
    vocabularyCache = new Set<string>()
    for (const term of Object.values((termsData as TermsFile).groups).flat()) {
      for (const word of normalizeLabel(term).split(/[\s/,;()\-–]+/u)) {
        const k = labelKey(word)
        if (k.length >= 2) vocabularyCache.add(k)
      }
    }
  }
  if (additionalTerms.length === 0) return vocabularyCache
  const merged = new Set(vocabularyCache)
  for (const term of additionalTerms) {
    for (const word of normalizeLabel(term).split(/[\s/,;()\-–]+/u)) {
      const k = labelKey(word)
      if (k.length >= 2) merged.add(k)
    }
  }
  return merged
}

/** Chu doc duoc da la 1 thuat ngu bien (khop DUNG ca dau, khong phan biet hoa/thuong)? */
export function isKnownTerm(text: string, additionalTerms: readonly string[] = []): boolean {
  const value = normalizeLabel(text)
  const compact = labelKey(value)
  if (compact.length < 2) return false
  const lower = value.toLocaleLowerCase('vi-VN')
  return candidatesFor(compact, additionalTerms).some((term) => term.toLocaleLowerCase('vi-VN') === lower)
}

const KEEP_UPPER = new Set(['ĐM', 'TM', 'DC', 'TK', 'T', 'P', 'TB', 'BQ', 'TC', 'TT', 'CT'])

/** Dua 1 dap an ve dang thuat ngu chuan: chu thuong, viet hoa chu dau, giu nguyen viet tat. */
export function canonicalizeTerm(answer: string): string {
  const tokens = normalizeLabel(answer).split(' ')
  const out = tokens.map((token, index) => {
    const upper = token.toLocaleUpperCase('vi-VN')
    if (KEEP_UPPER.has(upper) && token === upper) return token
    if (KEEP_UPPER.has(upper) && /^[Đđ]m$|^[Tt]m$|^[Dd]c$|^[Tt]k$/u.test(token)) return upper
    const lower = token.toLocaleLowerCase('vi-VN')
    return index === 0 ? lower.charAt(0).toLocaleUpperCase('vi-VN') + lower.slice(1) : lower
  })
  return out.join(' ')
}

export interface LearnedTerm { term: string; count: number }

/** Hoc thuat ngu tu cac dap an da duyet: bo dap an qua ngan/qua dai/khong giong tieng Viet,
 * gop trung (khong phan biet hoa/thuong), tra ve theo tan suat giam dan. */
export function learnTermsFromAnswers(answers: readonly string[]): LearnedTerm[] {
  const counts = new Map<string, LearnedTerm>()
  for (const answer of answers) {
    const value = normalizeLabel(answer)
    if (value.length < 3 || value.length > 80) continue
    if ((value.match(/\p{L}/gu) ?? []).length < 3) continue
    const score = scoreVietnameseText(value)
    if (score.tokens === 0 || score.fragmented || score.ratio < 0.8) continue
    const term = canonicalizeTerm(value)
    const k = term.toLocaleLowerCase('vi-VN')
    const entry = counts.get(k)
    if (entry) entry.count++
    else counts.set(k, { term, count: 1 })
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.term.localeCompare(b.term, 'vi'))
}

/** So thuat ngu goc trong tu dien nap san (khong tinh bien the sinh them). */
export function builtinTermCount(): number {
  return new Set(Object.values((termsData as TermsFile).groups).flat().map(normalizeLabel)).size
}
