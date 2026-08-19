import { getDb } from '../db'
import type {
  SearchResultGroup,
  SearchSourceType,
  HighlightedChunkQuery,
  HighlightedChunk
} from '../../shared/types/search'

// FTS5 MATCH khong nhan an toan cac ky tu dac biet (", *, ^, :, ...) trong tu khoa tho.
// Boc CA CUM tu khoa trong 1 cap ngoac kep (phrase query) thay vi tung tu rieng
// noi AND - AND rieng le se khop du 2 tu nam CACH XA nhau bat ky dau trong doan
// (vd "co ban" AND se khop ca doan co "co" o dau va "ban" o cuoi rat xa nhau,
// khong dung y dinh nguoi dung khi go 1 cum tu lien). Phrase query yeu cau cac
// tu dung LIEN KE dung thu tu. Them "*" ngay sau dau ngoac dong (cu phap
// prefix-query cua FTS5) de tu CUOI CUNG trong cum duoc khop theo tien to, ho
// tro go dang do dang (vd "co ba" khop "co bản").
//
// NGOAI LE: neu rawKeyword (TRUOC khi trim) ket thuc bang khoang trang, nguoi
// dung coi nhu da go XONG tu cuoi (chu dong bam space) - luc nay bo "*" de
// doi hoi khop CHINH XAC tu cuoi, khong con la tien to nua (vd "co " chi khop
// dung "co", khong con khop "con"/"cong").
function buildMatchQuery(rawKeyword: string): string {
  const isPrefix = !/\s$/.test(rawKeyword)
  const phrase = rawKeyword
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .replace(/"/g, '""')
  if (!phrase) return ''
  return isPrefix ? `"${phrase}"*` : `"${phrase}"`
}

// tokenize = "unicode61 remove_diacritics 2" xoa CA dau thanh LAN dau bien dang
// chu (ơ/ô/ư/â/ê/ă) - da xac nhan thuc te qua test: "cơ", "cổ", "cồ", "cô", "co"
// deu ra cung 1 token "co" sau tokenize. Dieu nay co tinh (cho phep go khong dau
// van tim ra noi dung co dau - xem getHighlightedChunk) nhung gay nham lan khi
// NGUOI DUNG DA GO CO DAU: FTS5 se khop nham ca nhung tu khac hoan toan chi vi
// trung chu cai goc sau khi bi xoa dau (vd go "cơ" khop nham "cổng"). Neu tu go
// vao CO dau tieng Viet, doi hoi doan van thuc su chua dung chu co dau do (so
// khop chuoi con, khong phan biet hoa/thuong) - chi ap dung khi nguoi dung chu
// dong go co dau, khong anh huong truong hop go khong dau (van long nhu cu).
const VIETNAMESE_DIACRITIC_MARK_RE = new RegExp('[\\u0300-\\u036f]')
function hasVietnameseDiacritic(term: string): boolean {
  return VIETNAMESE_DIACRITIC_MARK_RE.test(term.normalize('NFD')) || /đ/i.test(term)
}

function matchesRawDiacritics(text: string, rawKeyword: string): boolean {
  const lowerText = text.toLowerCase()
  return rawKeyword
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => !hasVietnameseDiacritic(term) || lowerText.includes(term.toLowerCase()))
}

// snippet() boc tung token da khop trong dau [ ] - lay ra dung chu that su
// xuat hien trong noi dung (giu nguyen dau/hoa-thuong) de so sanh do "chinh
// xac" voi tu nguoi dung go, phuc vu xep hang ket qua ben duoi.
function extractMatchedTokens(snippet: string): string[] {
  const matches = snippet.match(/\[([^\]]+)\]/g) ?? []
  return matches.map((m) => m.slice(1, -1))
}

// Tach 1 ky tu tieng Viet thanh (chu cai goc, dau bien dang chu, dau thanh)
// de so sanh CHI TIET voi ky tu tuong ung trong tu khoa - vd "ơ" = "o" + dau
// moc (bien dang chu, KHONG phai dau thanh); "ờ" = "o" + dau moc + dau huyen
// (thanh). Dung NFD (Unicode decompose) de tach cac dau nay ra thanh combining
// mark rieng. "đ"/"Đ" la ngoai le - KHONG decompose qua NFD (la chu cai rieng
// trong Unicode, khong phai "d" + dau ghep) nen phai xu ly rieng.
// Dung ma hex Unicode tuong minh (khong go truc tiep ky tu combining trong
// source) de tranh sai sot kho phat hien bang mat thuong.
// U+0300 huyen, U+0301 sac, U+0303 nga, U+0309 hoi, U+0323 nang (dau THANH).
const TONE_MARKS = new Set(
  ['0300', '0301', '0303', '0309', '0323'].map((h) => String.fromCharCode(parseInt(h, 16)))
)
// U+0302 mu (â ê ô), U+0306 trang (ă), U+031B moc (ơ ư) - dau BIEN DANG CHU.
const SHAPE_MARKS = new Set(
  ['0302', '0306', '031B'].map((h) => String.fromCharCode(parseInt(h, 16)))
)

const D_STROKE_LOWER = String.fromCharCode(0x0111) // đ

function decomposeChar(ch: string): { base: string; shape: string; tone: string } {
  const lower = ch.toLowerCase()
  if (lower === D_STROKE_LOWER) return { base: 'd', shape: 'stroke', tone: '' }
  const nfd = lower.normalize('NFD')
  let base = ''
  let shape = ''
  let tone = ''
  for (const c of nfd) {
    if (TONE_MARKS.has(c)) tone = c
    else if (SHAPE_MARKS.has(c)) shape = c
    else base += c
  }
  return { base, shape, tone }
}

// 0 = giong het, 1 = chi khac dau THANH (sắc/huyền/hỏi/ngã/nặng), 2 = chi
// khac dau BIEN DANG CHU (ơ/ư/ă/â/ê...), 3 = khac ca 2.
function classifyChar(a: string, b: string): 0 | 1 | 2 | 3 {
  const da = decomposeChar(a)
  const db = decomposeChar(b)
  const toneDiff = da.tone !== db.tone
  const shapeDiff = da.shape !== db.shape
  if (!toneDiff && !shapeDiff) return 0
  if (toneDiff && !shapeDiff) return 1
  if (!toneDiff && shapeDiff) return 2
  return 3
}

// Gop ket qua so sanh tung ky tu trong ca doan tien to lai thanh 1 hang muc
// duy nhat: chi can 1 ky tu bat ky khac dau thanh (du cac ky tu khac deu
// giong het) la ca doan tinh "chi sai thanh sac"; tuong tu cho dau bien dang
// chu; neu vua co ky tu sai thanh VUA co ky tu sai dau chu (o 2 vi tri khac
// nhau, hoac cung 1 vi tri sai ca 2) thi tinh la hang muc te nhat "sai ca 2".
function classifyPrefix(term: string, matchedPrefix: string): 0 | 1 | 2 | 3 {
  let hasTone = false
  let hasShape = false
  const len = Math.min(term.length, matchedPrefix.length)
  for (let i = 0; i < len; i++) {
    const c = classifyChar(term[i], matchedPrefix[i])
    if (c === 1) hasTone = true
    else if (c === 2) hasShape = true
    else if (c === 3) {
      hasTone = true
      hasShape = true
    }
  }
  if (!hasTone && !hasShape) return 0
  if (hasTone && !hasShape) return 1
  if (!hasTone && hasShape) return 2
  return 3
}

// Xep hang do "chinh xac" cua ket qua so voi CA CUM tu nguoi dung go - KHONG
// dung de loai bo ket qua (khac matchesRawDiacritics ben tren), chi dung de
// SAP XEP theo dung yeu cau: uu tien 1 (quan trong nhat) la SO KY TU CHENH
// LECH giua tu khop va tu khoa (dung so ky tu > hon 1 ky tu > hon 2 ky tu >
// ...) - tu khop dung khop DAI HON tu khoa cang nhieu ky tu thi cang xep
// sau; trong CUNG 1 muc chenh lech do dai, uu tien 2 la do chinh xac dau:
// giong het > chi sai dau thanh > chi sai dau bien dang chu > sai ca 2.
//
// snippet()/highlight() cua FTS5 boc CA CUM tu da khop (nhieu tu lien nhau)
// thanh 1 KHOI [ ] DUY NHAT (da xac nhan thuc te qua test: "cơ thể" -> khoi
// "[Cơ thể]", khong phai 2 khoi rieng "[Cơ] [thể]") - vi vay so sanh CA CUM
// voi rawKeyword (join lai thanh 1 chuoi).
function precisionRank(snippet: string, rawKeyword: string): number {
  const term = rawKeyword.trim().split(/\s+/).filter(Boolean).join(' ')
  if (!term) return 0

  const tokens = extractMatchedTokens(snippet)
  const matched = tokens[tokens.length - 1]
  if (!matched) return Number.MAX_SAFE_INTEGER

  const lengthDiff = Math.max(0, matched.length - term.length)
  const category = classifyPrefix(term, matched)
  return lengthDiff * 4 + category
}

// Ky tu dieu khien lam marker khi lay noi dung day du kem highlight - gan
// nhu khong bao gio xuat hien that trong van ban tu nhien, an toan de client
// split lai thanh doan thuong/doan khop.
export const HIGHLIGHT_START = ''
export const HIGHLIGHT_END = ''

interface SearchRow {
  sourceType: SearchSourceType
  sourceId: string
  lessonId: string
  topicId: string
  lessonTitle: string
  topicName: string
  snippet: string
  unitType: string
  unitIndex: number
}

export function searchAll(rawKeyword: string): SearchResultGroup[] {
  const keyword = rawKeyword.trim()
  if (!keyword) return []

  // Truyen rawKeyword (CHUA trim) - buildMatchQuery can biet co khoang trang
  // cuoi hay khong de quyet dinh khop chinh xac hay khop tien to (xem ghi chu
  // trong buildMatchQuery).
  const matchQuery = buildMatchQuery(rawKeyword)
  if (!matchQuery) return []

  const rows = getDb()
    .prepare(
      `SELECT
         si.source_type as sourceType,
         si.source_id as sourceId,
         si.lesson_id as lessonId,
         si.topic_id as topicId,
         l.title as lessonTitle,
         t.name as topicName,
         snippet(search_index, 1, '[', ']', '…', 12) as snippet,
         si.unit_type as unitType,
         si.unit_index as unitIndex
       FROM search_index si
       JOIN lessons l ON l.id = si.lesson_id
       JOIN topics t ON t.id = si.topic_id
       WHERE search_index MATCH ?
       ORDER BY t.name, l.title, si.unit_index`
    )
    .all(matchQuery) as SearchRow[]

  // Sap xep ket qua chinh xac nhat len truoc (rank 0 = khop y het, rank 1 =
  // khop tien to chu cai, rank 2 = chi khop sau khi tokenizer xoa dau) - sort
  // on dinh (Array.sort da dam bao stable) nen thu tu topic/bai hoc/trang cu
  // (tu ORDER BY SQL) van duoc giu nguyen giua cac ket qua cung rank.
  const sortedRows = [...rows]
    .filter((row) => matchesRawDiacritics(row.snippet, keyword))
    .sort((a, b) => precisionRank(a.snippet, keyword) - precisionRank(b.snippet, keyword))

  const groups = new Map<string, SearchResultGroup>()
  for (const row of sortedRows) {
    let group = groups.get(row.topicId)
    if (!group) {
      group = { topicId: row.topicId, topicName: row.topicName, items: [] }
      groups.set(row.topicId, group)
    }
    group.items.push({
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      lessonId: row.lessonId,
      lessonTitle: row.lessonTitle,
      snippet: row.snippet,
      unitType: row.unitType,
      unitIndex: row.unitIndex
    })
  }

  return Array.from(groups.values())
}

interface HighlightRow {
  unitType: string
  unitIndex: number
  highlighted: string
}

// Lay lai dung 1 don vi (trang/slide/toan van ban/ghi chu) da khop, tra ve
// FULL noi dung (khong cat ngan nhu snippet) voi tu khop duoc FTS5 tu danh
// dau bang HIGHLIGHT_START/END - dung highlight() cua FTS5 thay vi tu so
// khop bang JS de khong bi lech dau tieng Viet (tokenizer remove_diacritics
// khien "xet nghiem" khong dau van khop "XÉT NGHIỆM" co dau, so khop JS
// thuong se khong tim ra vi tri).
export function getHighlightedChunk(query: HighlightedChunkQuery): HighlightedChunk | null {
  const matchQuery = buildMatchQuery(query.keyword)
  if (!matchQuery) return null

  const row = getDb()
    .prepare(
      `SELECT
         unit_type as unitType,
         unit_index as unitIndex,
         highlight(search_index, 1, ?, ?) as highlighted
       FROM search_index
       WHERE source_type = ? AND source_id = ? AND unit_type = ? AND unit_index = ?
         AND search_index MATCH ?`
    )
    .get(
      HIGHLIGHT_START,
      HIGHLIGHT_END,
      query.sourceType,
      query.sourceId,
      query.unitType,
      query.unitIndex,
      matchQuery
    ) as HighlightRow | undefined

  return row ?? null
}
