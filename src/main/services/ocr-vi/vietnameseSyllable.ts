// Kiem tra am tiet tieng Viet (thuan, khong phu thuoc Electron). Dung de:
//  - danh gia text layer PDF co tin duoc khong (am tiet bi tach "th ượ ng" -> sai)
//  - cham diem ung vien OCR khi bo phieu (ung vien nhieu am tiet hop le thang)
// Khong phai tu dien: chi kiem tra cau truc am dau + van + dau thanh hop le.

const TONE_MARKS = new Set(['̀', '́', '̃', '̉', '̣'])
const ACUTE = '́'
const DOT_BELOW = '̣'

// Phu am dau (dai nhat truoc). 'gi' va 'qu' xu ly rieng.
const ONSETS = ['ngh', 'ng', 'nh', 'ch', 'gh', 'gi', 'kh', 'ph', 'qu', 'th', 'tr',
  'b', 'c', 'd', 'đ', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'v', 'x']

// nhan -> cac am cuoi cho phep ('' = am tiet mo). Viet khong dau thanh.
const RIMES: Record<string, string[]> = {
  a: ['', 'c', 'ch', 'm', 'n', 'ng', 'nh', 'p', 't', 'i', 'o', 'u', 'y'],
  'ă': ['c', 'm', 'n', 'ng', 'p', 't'],
  'â': ['c', 'm', 'n', 'ng', 'p', 't', 'u', 'y'],
  e: ['', 'c', 'ch', 'm', 'n', 'ng', 'nh', 'p', 't', 'o'],
  'ê': ['', 'ch', 'm', 'n', 'nh', 'p', 't', 'u'],
  i: ['', 'ch', 'm', 'n', 'nh', 'p', 't', 'u'],
  y: [''],
  o: ['', 'c', 'm', 'n', 'ng', 'p', 't', 'i'],
  'ô': ['', 'c', 'm', 'n', 'ng', 'p', 't', 'i'],
  'ơ': ['', 'm', 'n', 'p', 't', 'i'],
  u: ['', 'c', 'm', 'n', 'ng', 'p', 't', 'i'],
  'ư': ['', 'c', 'ng', 'i', 'u', 'n', 't', 'm'],
  ia: [''], 'iê': ['c', 'm', 'n', 'ng', 'p', 't', 'u'], 'yê': ['m', 'n', 't', 'u'],
  ua: [''], 'uô': ['', 'c', 'm', 'n', 'ng', 't', 'i'], 'ưa': [''], 'ươ': ['c', 'm', 'n', 'ng', 'p', 't', 'i', 'u'],
  oa: ['', 'c', 'ch', 'm', 'n', 'ng', 'nh', 'p', 't', 'i', 'y'], 'oă': ['c', 'm', 'n', 'ng', 't'],
  oe: ['', 'n', 'o', 't'], 'uê': ['', 'ch', 'n', 'nh'], uy: ['', 'ch', 'n', 'nh', 't', 'p', 'u'],
  'uâ': ['n', 'ng', 't', 'y'], 'uyê': ['n', 't'], 'uơ': ['']
}
const FRONT_VOWEL = /^(i|e|ê|y|ia|iê|yê)/u
const STOP_CODAS = new Set(['c', 'ch', 'p', 't'])

/** Tach dau thanh ra khoi chuoi (NFC thuong, khong dau thanh). tone=null neu khong co dau,
 * 'multi' neu co nhieu dau thanh, 'bad' neu dau gan vao phu am. */
function splitTone(text: string): { plain: string; tone: string | null | 'multi' | 'bad' } {
  const nfd = text.toLocaleLowerCase('vi').normalize('NFD')
  let plain = ''
  let tone: string | null | 'multi' | 'bad' = null
  let lastBase = ''
  for (const ch of nfd) {
    if (TONE_MARKS.has(ch)) {
      if (!/^[aeiouy]$/.test(lastBase)) tone = 'bad'
      else tone = tone === null ? ch : 'multi'
      continue
    }
    plain += ch
    if (!/\p{M}/u.test(ch)) lastBase = ch
  }
  return { plain: plain.normalize('NFC'), tone }
}

let validToneless: Map<string, boolean> | null = null // value = am cuoi tac (c, ch, p, t)
let validStripped: Set<string> | null = null

const stripAll = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd')

function buildTables(): void {
  validToneless = new Map()
  validStripped = new Set()
  for (const [nucleus, codas] of Object.entries(RIMES)) {
    for (const coda of codas) {
      const rime = nucleus + coda
      const front = FRONT_VOWEL.test(rime)
      const stop = STOP_CODAS.has(coda)
      const add = (syllable: string): void => {
        validToneless!.set(syllable, stop); validStripped!.add(stripAll(syllable))
      }
      add(rime) // am tiet khong phu am dau ("anh", "yêu", "oan")
      for (const onset of ONSETS) {
        if (onset === 'gi') { if (!rime.startsWith('i')) add(onset + rime); continue }
        if (onset === 'qu') { if (!/^(u|o)/u.test(rime) && !front) add(onset + rime); continue }
        if (onset === 'k' || onset === 'gh' || onset === 'ngh') { if (front) add(onset + rime); continue }
        if (onset === 'c' || onset === 'g' || onset === 'ng') { if (!front) add(onset + rime); continue }
        if (onset === 'q') continue
        add(onset + rime)
      }
    }
  }
  // "gì", "gỉ"... = gi + i ; "giêng" da co qua 'gi' + 'iê'? gi + ê -> 'giê' + coda.
  for (const extra of ['gi', 'giê', 'giêng', 'giêm', 'giên']) { validToneless.set(extra, false); validStripped.add(stripAll(extra)) }
  for (const extra of ['giết', 'giếc']) { validToneless.set(extra, true); validStripped.add(stripAll(extra)) }
}

/** Am tiet hop le: phu am dau + van + dau thanh dung quy tac (am cuoi c/ch/p/t chi mang sac/nang). */
export function isValidVietnameseSyllable(word: string): boolean {
  if (validToneless === null) buildTables()
  const { plain, tone } = splitTone(word)
  if (tone === 'multi' || tone === 'bad') return false
  if (!/^\p{L}+$/u.test(plain)) return false
  const stop = validToneless!.get(plain)
  if (stop === undefined) return false
  // Am cuoi tac (c, ch, p, t) chi mang dau sac hoac nang.
  if (stop && tone !== ACUTE && tone !== DOT_BELOW) return false
  return true
}

/** Am tiet viet KHONG dau (chi chu cai la-tinh co ban): "tinh", "hoan", "thuong". */
export function isPlainVietnameseSyllable(word: string): boolean {
  if (validStripped === null) buildTables()
  const lower = word.toLocaleLowerCase('vi')
  if (!/^[a-z]+$/.test(lower)) return false
  return validStripped!.has(lower)
}

/** Viet tat giai phau/y khoa pho bien (so sanh khong dau, chu thuong). */
const ABBREVIATIONS = new Set(['dm', 'tm', 'dc', 'tk', 'tb', 'xt', 'ct', 'mri', 'cm', 'mm', 'bn', 'l', 'r', 'p', 't',
  'ph', 'tr', 'gp', 'vd', 'sl', 'ng', 'ngh', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'k', 'm', 'n', 'o', 's', 'u', 'v', 'x',
  'i', 'ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi', 'xii'])
export const isKnownAbbreviation = (token: string): boolean => ABBREVIATIONS.has(stripAll(token.toLocaleLowerCase('vi')))

/** Viet tat IN HOA ngan khong dau (TC, TT, DM...): 2-4 chu cai hoa, khong phai am tiet hop le. */
const isUpperAbbreviation = (token: string): boolean => /^[A-Z]{2,4}$/.test(token)

export type TokenKind = 'valid' | 'plain' | 'abbr' | 'number' | 'invalid'

export function classifyToken(token: string): TokenKind {
  if (/^\d+([.,]\d+)?$/.test(token)) return 'number'
  if (isValidVietnameseSyllable(token)) return 'valid'
  if (isKnownAbbreviation(token) || isUpperAbbreviation(token)) return 'abbr'
  if (isPlainVietnameseSyllable(token)) return 'plain'
  return 'invalid'
}

export interface TextVietnameseScore {
  tokens: number
  valid: number // am tiet hop le co dau/hoac ngang day du
  plain: number // am tiet hop le nhung KHONG dau (vd "tinh hoan")
  abbr: number
  numbers: number
  invalid: number
  /** (valid + abbr + numbers + plain*0.7) / tokens, 0..1; 0 neu khong co token. */
  ratio: number
  /** Co ky tu don/ngan khong thanh am tiet nam giua cac tu (dau hieu am tiet bi tach). */
  fragmented: boolean
}

/** Cham diem mot dong chu: ti le tu la am tiet tieng Viet / viet tat hop le. */
export function scoreVietnameseText(text: string): TextVietnameseScore {
  const tokens = text.normalize('NFC').split(/[\s/\\,;:()[\]{}"'|+=_\-–—.]+/u).filter((t) => /[\p{L}\p{N}]/u.test(t))
  let valid = 0; let plain = 0; let abbr = 0; let numbers = 0; let invalid = 0
  const kinds: TokenKind[] = []
  for (const token of tokens) {
    const kind = classifyToken(token)
    kinds.push(kind)
    if (kind === 'valid') valid++
    else if (kind === 'plain') plain++
    else if (kind === 'abbr') abbr++
    else if (kind === 'number') numbers++
    else invalid++
  }
  // Am tiet bi tach: token khong hop le dai <= 2 ky tu ben canh mot token khac, hoac
  // chuoi (>=2) token 1-2 ky tu lien tiep co dau thanh.
  let fragmented = false
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const marked = /[̀-ͯ]|[ạảãàáâấầẩẫậăắằẳẵặẹẻẽèéêếềểễệịỉĩìíọỏõòóôốồổỗộơớờởỡợụủũùúưứừửữựỳýỵỷỹ]/u.test(t.normalize('NFC'))
    if (kinds[i] === 'invalid' && t.length <= 2 && marked && tokens.length >= 2) fragmented = true
  }
  const total = tokens.length
  return { tokens: total, valid, plain, abbr, numbers, invalid, fragmented,
    ratio: total === 0 ? 0 : (valid + abbr + numbers + plain * 0.7) / total }
}
