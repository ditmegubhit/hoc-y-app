import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMigratedMemoryDb } from '../testDb'

// getDb() that import electron -> thay bang DB :memory: da chay het migration.
const holder = vi.hoisted(() => ({ db: null as unknown as Database.Database }))
vi.mock('../index', () => ({ getDb: () => holder.db }))

import * as nodes from './practiceNodes.repo'
import * as regions from './practiceRegions.repo'
import * as quiz from './practiceQuiz.repo'

const rect = (x0: number, y0: number) => ({ x0, y0, x1: x0 + 100, y1: y0 + 30 })

function newFile(name = 'bai 1', parentId: string | null = null): string {
  return nodes.createFileNode({
    parentId, name, storedPath: `C:\\kho\\${name}.pdf`, fileSizeBytes: 10, sourcePath: null, sourceMtimeMs: null, totalPages: 5
  }).id
}

function confirmedRegion(fileId: string, page: number, answer: string, x = 10, y = 10) {
  return regions.createRegion({
    fileId, pageNumber: page, labelBox: rect(x, y), refWidth: 1000, refHeight: 1000,
    answerText: answer, status: 'confirmed', reviewed: true
  })
}

beforeEach(() => {
  holder.db = createMigratedMemoryDb()
})

describe('migration 022', () => {
  it('tao du bang va giu nguyen bang anatomy cu', () => {
    const names = (holder.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name)
    for (const table of [
      'practice_nodes', 'practice_files', 'practice_regions', 'practice_page_reviews', 'practice_station_sets',
      'practice_station_set_questions', 'practice_attempts', 'practice_attempt_questions', 'practice_attempt_answers',
      'anatomy_label_candidates', 'anatomy_questions', 'attachments'
    ]) expect(names).toContain(table)
  })

  it('gia tri mac dinh cua file va vung', () => {
    const fileId = newFile()
    const file = nodes.getFile(fileId)!
    expect(file.maskColor).toBe('#0a0a0a')
    expect(file.maskOpacity).toBe(0.5)
    expect(file.scanStatus).toBe('none')
    const region = regions.createRegion({ fileId, pageNumber: 1, labelBox: rect(1, 1), refWidth: 10, refHeight: 10 })
    expect(region.status).toBe('pending')
    expect(region.alternates).toEqual([])
    expect(region.suspect).toBe(false)
  })

  it('xoa node xoa day chuyen (CASCADE) den vung va luot thi', () => {
    const folder = nodes.createFolder(null, 'GP')
    const fileId = newFile('f', folder.id)
    confirmedRegion(fileId, 1, 'Thận')
    const paths = nodes.deleteNode(folder.id)
    expect(paths).toEqual([{ fileId, storedPath: 'C:\\kho\\f.pdf' }])
    for (const table of ['practice_nodes', 'practice_files', 'practice_regions']) {
      expect((holder.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n).toBe(0)
    }
  })
})

describe('cay thu muc', () => {
  it('khong cho dat vao file, khong cho vong lap', () => {
    const folder = nodes.createFolder(null, 'A')
    const sub = nodes.createFolder(folder.id, 'B')
    const fileId = newFile()
    expect(() => nodes.createFolder(fileId, 'X')).toThrow()
    expect(() => nodes.moveNode(folder.id, sub.id)).toThrow()
    expect(() => nodes.moveNode(folder.id, folder.id)).toThrow()
  })

  it('moveNode chen dung vi tri va danh lai sort_order', () => {
    const a = nodes.createFolder(null, 'a')
    const b = nodes.createFolder(null, 'b')
    const c = nodes.createFolder(null, 'c')
    nodes.moveNode(c.id, null, 0)
    expect(nodes.listTreeNodes().map((n) => n.id)).toEqual([c.id, a.id, b.id])
    nodes.moveNode(a.id, b.id)
    const tree = nodes.listTreeNodes()
    expect(tree.find((n) => n.id === a.id)?.parentId).toBe(b.id)
  })

  it('tom tat file co so vung va so cau', () => {
    const fileId = newFile()
    confirmedRegion(fileId, 1, 'Thận')
    regions.createRegion({ fileId, pageNumber: 1, labelBox: rect(5, 5), refWidth: 10, refHeight: 10 })
    const node = nodes.listTreeNodes().find((n) => n.id === fileId)!
    expect(node.file).toMatchObject({ regionCount: 2, confirmedCount: 1, totalPages: 5 })
  })

  it('cai dat file: kiem tra mau, ep do mo; reset mau rieng', () => {
    const fileId = newFile()
    expect(() => nodes.updateFileSettings({ fileId, maskColor: 'xanh' })).toThrow()
    const updated = nodes.updateFileSettings({ fileId, maskColor: '#FF0000', maskOpacity: 7 })
    expect(updated.maskColor).toBe('#ff0000')
    expect(updated.maskOpacity).toBe(1)
    const r = confirmedRegion(fileId, 1, 'Thận')
    regions.updateRegion(r.id, { colorOverride: '#00ff00', opacityOverride: 0.3 })
    expect(nodes.resetRegionColors({ fileId })).toBe(1)
    const after = regions.getRegion(r.id)!
    expect(after.colorOverride).toBeNull()
    expect(after.opacityOverride).toBe(0.3)
    nodes.resetRegionColors({ fileId, includeOpacity: true })
    expect(regions.getRegion(r.id)!.opacityOverride).toBeNull()
  })

  it('doi file goc: co vung thi hoi xac nhan, khong giong thi xoa het vung', () => {
    const fileId = newFile()
    nodes.saveScanState(fileId, { status: 'done', lastPage: 5, totalPages: 5, completed: true })
    confirmedRegion(fileId, 1, 'Thận')
    nodes.replaceStoredFile(fileId, { storedPath: 'C:\\kho\\moi.pdf', fileSizeBytes: 20, sourceMtimeMs: 5, totalPages: 6 })
    expect(nodes.getFile(fileId)).toMatchObject({ needsSourceConfirmation: true, totalPages: 6, scanCompleted: true })
    nodes.resolveSourceChange(fileId, true)
    expect(nodes.getFile(fileId)).toMatchObject({ needsSourceConfirmation: false, regionCount: 1 })
    nodes.replaceStoredFile(fileId, { storedPath: 'C:\\kho\\moi2.pdf', fileSizeBytes: 20, sourceMtimeMs: 6, totalPages: 6 })
    nodes.resolveSourceChange(fileId, false)
    expect(nodes.getFile(fileId)).toMatchObject({ regionCount: 0, scanCompleted: false, scanStatus: 'none' })
  })

  it('file chua co vung: doi file goc dua trang thai quet ve ban dau', () => {
    const fileId = newFile()
    nodes.saveScanState(fileId, { status: 'done', lastPage: 5, totalPages: 5, completed: true })
    nodes.replaceStoredFile(fileId, { storedPath: 'C:\\kho\\moi.pdf', fileSizeBytes: 20, sourceMtimeMs: 5, totalPages: 7 })
    expect(nodes.getFile(fileId)).toMatchObject({ needsSourceConfirmation: false, scanCompleted: false, scanStatus: 'none' })
  })
})

describe('vung', () => {
  it('confirmed bat buoc co dap an', () => {
    const fileId = newFile()
    expect(() => regions.createRegion({
      fileId, pageNumber: 1, labelBox: rect(1, 1), refWidth: 10, refHeight: 10, status: 'confirmed', answerText: '  '
    })).toThrow()
    const r = regions.createRegion({ fileId, pageNumber: 1, labelBox: rect(1, 1), refWidth: 10, refHeight: 10 })
    expect(() => regions.updateRegion(r.id, { status: 'confirmed' })).toThrow()
    const ok = regions.updateRegion(r.id, { status: 'confirmed', answerText: ' Thận ', alternates: [' Kidney ', ''], reviewed: true })
    expect(ok).toMatchObject({ status: 'confirmed', answerText: 'Thận', alternates: ['Kidney'], reviewed: true, manual: true })
  })

  it('mau khong hop le bi tu choi; xoa that + khoi phuc giu nguyen id', () => {
    const fileId = newFile()
    const r = confirmedRegion(fileId, 2, 'Thận')
    expect(() => regions.updateRegion(r.id, { colorOverride: 'bad' })).toThrow()
    const edited = regions.updateRegion(r.id, { colorOverride: '#ABCDEF' })
    regions.deleteRegion(r.id)
    expect(regions.getRegion(r.id)).toBeNull()
    const back = regions.restoreRegion(edited)
    expect(back.id).toBe(r.id)
    expect(back.colorOverride).toBe('#abcdef')
    expect(regions.listRegionsForPage(fileId, 2)).toHaveLength(1)
  })

  it('quet lai: thay vung chua duyet, giu vung da duyet/tu ve/chi che, bo vung chong len vung giu', () => {
    const fileId = newFile()
    const det = (text: string, x: number, y: number, confidence: number | null = 0.9) => ({
      pageNumber: 1, rawText: text, labelBox: rect(x, y), refWidth: 1000, refHeight: 1000, confidence
    })
    // lan quet dau: 1 vung tin cay cao (confirmed, chua duyet), 1 vung thap (pending)
    const first = regions.replaceDetectedRegions(fileId, 1, [det('Thận phải', 10, 10), det('?', 10, 100, 0.4)])
    expect(first).toHaveLength(2)
    const listed = regions.listRegionsForPage(fileId, 1)
    expect(listed.map((r) => [r.status, r.reviewed])).toEqual([['confirmed', false], ['pending', false]])
    expect(listed[0].answerText).toBe('Thận phải')

    // nguoi dung: duyet vung 1, tu ve vung 3, danh dau vung 4 "chi che"
    regions.updateRegion(listed[0].id, { answerText: 'Thận phải (đã sửa)', reviewed: true })
    const drawn = regions.createRegion({ fileId, pageNumber: 1, labelBox: rect(500, 500), refWidth: 1000, refHeight: 1000 })
    const rejected = regions.replaceDetectedRegions(fileId, 1, [det('rac', 700, 700, 0.5)])
    const rejectedRegion = regions.getRegion(rejected[0])!
    regions.updateRegion(rejectedRegion.id, { status: 'rejected' })

    // quet lai: trung vi tri vung da duyet / tu ve / chi che -> khong nhan doi; vung moi o cho khac -> them
    const again = regions.replaceDetectedRegions(fileId, 1, [
      det('Thận phải', 12, 12), det('Tu ve', 502, 502), det('rac', 700, 700), det('Moi', 300, 300)
    ])
    expect(again).toHaveLength(1)
    const final = regions.listRegionsForPage(fileId, 1)
    const byId = new Map(final.map((r) => [r.id, r]))
    expect(byId.get(listed[0].id)?.answerText).toBe('Thận phải (đã sửa)')
    expect(byId.has(listed[1].id)).toBe(false) // vung pending chua duyet bi thay
    expect(byId.has(drawn.id)).toBe(true)
    expect(byId.get(rejectedRegion.id)?.status).toBe('rejected')
    expect(final.some((r) => r.rawText === 'Moi')).toBe(true)
    expect(final).toHaveLength(4)
  })

  it('trang bi loai khoi bai thi', () => {
    const fileId = newFile()
    confirmedRegion(fileId, 1, 'A')
    confirmedRegion(fileId, 2, 'B')
    regions.setPageReview({ fileId, pageNumber: 2, excluded: true })
    expect(quiz.listQuestionSummaries(fileId).map((q) => q.answerText)).toEqual(['A'])
    expect(regions.listPageStates(fileId)).toEqual([{ pageNumber: 2, reviewed: false, excluded: true }])
  })
})

describe('bai thi', () => {
  function setup() {
    const fileId = newFile()
    nodes.updateFileSettings({ fileId, maskColor: '#112233' })
    const a = confirmedRegion(fileId, 1, 'Thận', 10, 10)
    const b = confirmedRegion(fileId, 1, 'Niệu quản', 10, 100)
    const c = confirmedRegion(fileId, 2, 'Bàng quang', 10, 10)
    regions.updateRegion(b.id, { colorOverride: '#ff0000' })
    // vung "chi che" khong thanh cau hoi nhung van phai bi che
    regions.createRegion({ fileId, pageNumber: 1, labelBox: rect(400, 400), refWidth: 1000, refHeight: 1000, status: 'rejected' })
    return { fileId, a, b, c }
  }

  it('tao de: loc vung khong hop le, dat ten tu dong, kiem tra thoi gian', () => {
    const { fileId, a } = setup()
    const pending = regions.createRegion({ fileId, pageNumber: 1, labelBox: rect(1, 1), refWidth: 10, refHeight: 10 })
    const set = quiz.createStationSet({ fileId, name: '', feedbackMode: 'practice', timeLimitSeconds: 30, regionIds: [a.id, pending.id, 'khong-ton-tai', a.id] })
    expect(set.questionCount).toBe(1)
    expect(set.name).toBe('Đề 1')
    expect(() => quiz.createStationSet({ fileId, name: 'x', feedbackMode: 'exam', timeLimitSeconds: 0, regionIds: [a.id] })).toThrow()
    expect(() => quiz.createStationSet({ fileId, name: 'x', feedbackMode: 'practice', timeLimitSeconds: 301, regionIds: [a.id] })).toThrow()
    expect(() => quiz.createStationSet({ fileId, name: 'x', feedbackMode: 'practice', timeLimitSeconds: 10, regionIds: [pending.id] })).toThrow()
  })

  it('luot thi: lop che moi vung (ke ca chi che) dung mau, khong lo dap an, xao thu tu bang rng', () => {
    const { fileId, a, b, c } = setup()
    const set = quiz.createStationSet({ fileId, name: 'De A', feedbackMode: 'exam', timeLimitSeconds: 20, regionIds: [a.id, b.id, c.id] })
    const started = quiz.startAttempt({ stationSetId: set.id }, () => 0)
    expect(started.questions).toHaveLength(3)
    expect(JSON.stringify(started)).not.toContain('Thận')
    expect(JSON.stringify(started)).not.toContain('Bàng quang')
    expect(started.remainingMs).toBe(20000)
    const q1 = started.questions.find((q) => q.regionId === a.id)!
    expect(q1.masks).toHaveLength(3) // a, b va vung chi che tren trang 1
    expect(q1.masks.map((m) => m.color).sort()).toEqual(['#112233', '#112233', '#ff0000'])
    expect(q1.targetBox).toEqual(a.labelBox)
    const q3 = started.questions.find((q) => q.regionId === c.id)!
    expect(q3.masks).toEqual([{ box: c.labelBox, color: '#112233' }])
    // rng luon 0 -> Fisher-Yates cho thu tu xoay vong co dinh, khac thu tu goc
    expect(started.questions.map((q) => q.regionId)).not.toEqual([a.id, b.id, c.id])
  })

  it('nop bai: cham theo ban chup, diem thang 10, lich su chi luu che do thi thu', () => {
    const { fileId, a, b, c } = setup()
    const exam = quiz.createStationSet({ fileId, name: 'Thi', feedbackMode: 'exam', timeLimitSeconds: 30, regionIds: [a.id, b.id, c.id] })
    const started = quiz.startAttempt({ stationSetId: exam.id })
    expect(quiz.checkAnswer({ attemptId: started.attemptId, regionId: a.id, submittedText: ' THẬN ' }).isCorrect).toBe(true)
    // sua/xoa vung sau khi bat dau KHONG anh huong cham diem cua luot dang lam
    regions.updateRegion(a.id, { answerText: 'Khac' })
    regions.deleteRegion(b.id)
    const review = quiz.submitAttempt({
      attemptId: started.attemptId, durationSeconds: 12,
      answers: [
        { regionId: a.id, submittedText: 'thận' },
        { regionId: b.id, submittedText: 'sai' },
        { regionId: 'la', submittedText: 'bo qua' }
      ]
    })
    expect(review).toMatchObject({ correctCount: 1, totalCount: 3, score: 3.3, attemptNumber: 1 })
    expect(review.answers.find((x) => x.regionId === a.id)).toMatchObject({ isCorrect: true, correctAnswerText: 'Thận' })
    expect(review.answers.find((x) => x.regionId === c.id)).toMatchObject({ isCorrect: false, submittedText: '' })
    // nop lai khong doi ket qua
    expect(quiz.submitAttempt({ attemptId: started.attemptId, durationSeconds: 1, answers: [] }).correctCount).toBe(1)
    expect(quiz.listAttemptHistory(fileId)).toHaveLength(1)
    expect(quiz.getAttemptReview(started.attemptId)?.score).toBe(3.3)

    const practice = quiz.createStationSet({ fileId, name: 'LT', feedbackMode: 'practice', timeLimitSeconds: 0, regionIds: [a.id, c.id] })
    const p = quiz.startAttempt({ stationSetId: practice.id })
    expect(p.remainingMs).toBeNull()
    quiz.submitAttempt({ attemptId: p.attemptId, durationSeconds: null, answers: [] })
    expect(quiz.listAttemptHistory(fileId)).toHaveLength(1) // luyen tap khong vao lich su

    quiz.deleteAttemptHistory(started.attemptId)
    expect(quiz.listAttemptHistory(fileId)).toHaveLength(0)
  })

  it('luu tien trinh va tiep tuc: tra lai cau tra loi, vi tri, thoi gian, khoan phat', () => {
    const { fileId, a, b } = setup()
    const set = quiz.createStationSet({ fileId, name: 'S', feedbackMode: 'practice', timeLimitSeconds: 30, regionIds: [a.id, b.id] })
    const started = quiz.startAttempt({ stationSetId: set.id })
    expect(quiz.findActiveAttempt(fileId)).toBe(started.attemptId)
    quiz.saveAttemptProgress({
      attemptId: started.attemptId, currentIndex: 1, remainingMs: 12345, penaltyDebtMs: 3000,
      answers: [{ regionId: a.id, submittedText: 'dở dang' }, { regionId: 'la', submittedText: 'bo' }]
    })
    const resumed = quiz.resumeAttempt(started.attemptId)!
    expect(resumed).toMatchObject({ currentIndex: 1, remainingMs: 12345, penaltyDebtMs: 3000 })
    expect(resumed.answers).toEqual([{ regionId: a.id, submittedText: 'dở dang' }])
    expect(resumed.questions.map((q) => q.regionId)).toEqual(started.questions.map((q) => q.regionId))
    quiz.submitAttempt({ attemptId: started.attemptId, durationSeconds: 5, answers: [] })
    expect(quiz.resumeAttempt(started.attemptId)).toBeNull()
    expect(quiz.findActiveAttempt(fileId)).toBeNull()
  })

  it('xoa de khong lam mat lich su; so lan lam tang dan', () => {
    const { fileId, a, c } = setup()
    const set = quiz.createStationSet({ fileId, name: 'S', feedbackMode: 'exam', timeLimitSeconds: 30, regionIds: [a.id, c.id] })
    const first = quiz.startAttempt({ stationSetId: set.id })
    quiz.submitAttempt({ attemptId: first.attemptId, durationSeconds: 1, answers: [] })
    const second = quiz.startAttempt({ stationSetId: set.id })
    expect(second.attemptNumber).toBe(2)
    expect(quiz.listStationSets(fileId)[0].nextAttemptNumber).toBe(3)
    quiz.submitAttempt({ attemptId: second.attemptId, durationSeconds: 1, answers: [] })
    quiz.deleteStationSet(set.id)
    const history = quiz.listAttemptHistory(fileId)
    expect(history).toHaveLength(2)
    expect(history[0].stationSetName).toBe('S')
  })

  it('bao cao sai sot - bo sung dap an dung: luyen tap dang lam cham lai ngay, luot sau cung dung', () => {
    const { fileId, a, b } = setup()
    const set = quiz.createStationSet({ fileId, name: 'LT', feedbackMode: 'practice', timeLimitSeconds: 0, regionIds: [a.id, b.id] })
    const started = quiz.startAttempt({ stationSetId: set.id })
    expect(quiz.checkAnswer({ attemptId: started.attemptId, regionId: a.id, submittedText: 'quả thận' }).isCorrect).toBe(false)
    const result = quiz.reportAnswerIssue({
      attemptId: started.attemptId, regionId: a.id, kind: 'add', text: '  Quả thận ', submittedText: 'quả thận'
    })
    expect(result).toMatchObject({ isCorrect: true, correctAnswerText: 'Thận', review: null })
    expect(regions.getRegion(a.id)?.alternates).toEqual(['Quả thận'])
    expect(regions.getRegion(a.id)?.answerText).toBe('Thận')
    expect(quiz.checkAnswer({ attemptId: started.attemptId, regionId: a.id, submittedText: 'QUẢ THẬN' }).isCorrect).toBe(true)
    // bo sung lan nua cung cau tra loi khong tao ban sao
    quiz.reportAnswerIssue({ attemptId: started.attemptId, regionId: a.id, kind: 'add', text: 'quả  thận', submittedText: 'quả thận' })
    expect(regions.getRegion(a.id)?.alternates).toEqual(['Quả thận'])
    // luot moi dung ban moi
    quiz.submitAttempt({ attemptId: started.attemptId, durationSeconds: 1, answers: [] })
    const next = quiz.startAttempt({ stationSetId: set.id })
    expect(quiz.checkAnswer({ attemptId: next.attemptId, regionId: a.id, submittedText: 'quả thận' }).isCorrect).toBe(true)
  })

  it('bao cao sai sot - sua dap an sai: cham lai luot da nop, cap nhat diem, bo sung khong trung dap an moi', () => {
    const { fileId, a, b } = setup()
    regions.updateRegion(a.id, { answerText: 'Thân', alternates: ['Thận', 'Quả thận'] }) // OCR doc sai
    const set = quiz.createStationSet({ fileId, name: 'Thi', feedbackMode: 'exam', timeLimitSeconds: 30, regionIds: [a.id, b.id] })
    const started = quiz.startAttempt({ stationSetId: set.id })
    const review = quiz.submitAttempt({
      attemptId: started.attemptId, durationSeconds: 5,
      answers: [{ regionId: a.id, submittedText: 'Thận ' }, { regionId: b.id, submittedText: 'Niệu quản' }]
    })
    expect(review).toMatchObject({ correctCount: 2, score: 10 }) // 'Thận' da la dap an chap nhan duoc
    // lam lai voi dap an chua duoc bo sung
    regions.updateRegion(a.id, { alternates: [] })
    const second = quiz.startAttempt({ stationSetId: set.id })
    const secondReview = quiz.submitAttempt({
      attemptId: second.attemptId, durationSeconds: 5,
      answers: [{ regionId: a.id, submittedText: 'Thận' }, { regionId: b.id, submittedText: 'Niệu quản' }]
    })
    expect(secondReview).toMatchObject({ correctCount: 1, totalCount: 2, score: 5 })

    const result = quiz.reportAnswerIssue({
      attemptId: second.attemptId, regionId: a.id, kind: 'replace', text: ' Thận', submittedText: 'Thận'
    })
    expect(result.isCorrect).toBe(true)
    expect(result.correctAnswerText).toBe('Thận')
    expect(result.review).toMatchObject({ correctCount: 2, totalCount: 2, score: 10 })
    expect(result.review?.answers.find((x) => x.regionId === a.id)).toMatchObject({ isCorrect: true, correctAnswerText: 'Thận' })
    expect(quiz.getAttemptReview(second.attemptId)?.score).toBe(10)
    expect(quiz.listAttemptHistory(fileId).find((h) => h.attemptId === second.attemptId)).toMatchObject({ correctCount: 2, score: 10 })
    expect(regions.getRegion(a.id)).toMatchObject({ answerText: 'Thận', alternates: [] })
  })

  it('bao cao sai sot: thi thu dang lam bi khoa, noi dung rong bi tu choi, vung da xoa bao loi', () => {
    const { fileId, a, b } = setup()
    const exam = quiz.createStationSet({ fileId, name: 'Thi', feedbackMode: 'exam', timeLimitSeconds: 30, regionIds: [a.id, b.id] })
    const started = quiz.startAttempt({ stationSetId: exam.id })
    expect(() => quiz.reportAnswerIssue({
      attemptId: started.attemptId, regionId: a.id, kind: 'add', text: 'x', submittedText: 'x'
    })).toThrow(/sau khi nộp/)
    quiz.submitAttempt({ attemptId: started.attemptId, durationSeconds: 1, answers: [] })
    expect(() => quiz.reportAnswerIssue({
      attemptId: started.attemptId, regionId: a.id, kind: 'replace', text: '   ', submittedText: ''
    })).toThrow()
    expect(() => quiz.reportAnswerIssue({
      attemptId: started.attemptId, regionId: 'la', kind: 'add', text: 'x', submittedText: ''
    })).toThrow()
    regions.deleteRegion(b.id)
    expect(() => quiz.reportAnswerIssue({
      attemptId: started.attemptId, regionId: b.id, kind: 'add', text: 'x', submittedText: ''
    })).toThrow(/không còn/)
  })

  it('on cau sai: chi cac cau sai/bo trong con ton tai, che do luyen tap', () => {
    const { fileId, a, b, c } = setup()
    const set = quiz.createStationSet({ fileId, name: 'Thi', feedbackMode: 'exam', timeLimitSeconds: 25, regionIds: [a.id, b.id, c.id] })
    const started = quiz.startAttempt({ stationSetId: set.id })
    expect(() => quiz.createReviewSet(started.attemptId)).toThrow() // chua nop
    quiz.submitAttempt({
      attemptId: started.attemptId, durationSeconds: 3,
      answers: [{ regionId: a.id, submittedText: 'Thận' }, { regionId: b.id, submittedText: 'sai' }]
    })
    regions.deleteRegion(c.id) // cau bo trong nhung da bi xoa -> khong dua vao bo on
    const review = quiz.createReviewSet(started.attemptId)
    expect(review).toMatchObject({ questionCount: 1, feedbackMode: 'practice', timeLimitSeconds: 25, isReviewSet: true })
    expect(review.name).toContain('Ôn câu sai')
    const again = quiz.startAttempt({ stationSetId: review.id })
    expect(again.questions.map((q) => q.regionId)).toEqual([b.id])

    const perfect = quiz.createStationSet({ fileId, name: 'Dung het', feedbackMode: 'exam', timeLimitSeconds: 10, regionIds: [a.id] })
    const p = quiz.startAttempt({ stationSetId: perfect.id })
    quiz.submitAttempt({ attemptId: p.attemptId, durationSeconds: 1, answers: [{ regionId: a.id, submittedText: 'thận' }] })
    expect(() => quiz.createReviewSet(p.attemptId)).toThrow()
  })
})
