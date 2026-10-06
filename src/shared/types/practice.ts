import type { AnatomyFeedbackMode, AnatomyTextReading, Rect } from './anatomyQuiz'

export type { Rect }
export type PracticeFeedbackMode = AnatomyFeedbackMode
export type PracticeTextReading = AnatomyTextReading

// ============================================================================
// API khu "Thuc hanh Giai phau" - window.api.practice.* (hook react-query nam o
// renderer/src/queries/practice.ts). Tom tat:
//
// CAY (thu muc long nhau, file PDF la la; id cua file == node id == fileId)
//   listNodes() -> PracticeTreeNode[] (phang, co parentId; file co them `file`)
//   createFolder({parentId, name}), renameNode({id,name}),
//   moveNode({id, parentId, index?}), deleteNode(id) (xoa file thi xoa ca ban sao trong kho)
//   pickAndAddFiles(parentId) mo hop thoai chon PDF; addFilesFromPaths(parentId, paths[])
//   cho keo-tha. Keo-tha tu Explorer: lay duong dan bang
//   window.api.practice.getPathForFile(file) (File trong su kien drop).
//   Chi nhan PDF: file khac / PDF loi bi tra ve trong `rejected`.
//   search(keyword) -> ket qua theo TEN (khong dau, khong phan biet hoa thuong).
//
// FILE
//   getFile(fileId), updateFileSettings({fileId, maskColor?, maskOpacity?}),
//   resetRegionColors({fileId, includeOpacity?}) (bo mau/do mo rieng cua vung),
//   getSourceStatus(fileId), syncSource(fileId) (kiem tra file goc doi chua),
//   resolveSourceChange({fileId, isSimilar}) (hoi "giong 90% file goc khong?":
//   true = giu vung, false = xoa het vung + de quet lai).
//
// QUET (tu tao dap an nhap cho ca file)
//   scanFile({fileId, force}) chay den khi xong (await duoc), ban su kien
//   onScanProgress; cancelScan(fileId); getScanState(fileId). Khong force thi
//   tiep tuc tu trang da quet dang do; force = quet lai tu dau nhung GIU cac vung
//   da duyet (reviewed) / tu ve (manual) / bi danh dau "chi che" (rejected).
//   onFilesUpdated(cb): file doi do dong bo voi file goc -> nen refetch.
//
// VUNG (practice_regions)
//   listRegionsForPage({fileId,pageNumber}), listRegionsForFile(fileId),
//   createRegion(...), updateRegion({id, patch}), deleteRegion(id) (xoa that),
//   restoreRegion(region) (hoan tac xoa), readRegionWithAi(regionId),
//   readPageWithAi({fileId,pageNumber}) (chi tra DE XUAT, khong tu luu),
//   listPageStates(fileId), setPageReview({fileId,pageNumber,reviewed?,excluded?})
//
// BAI THI
//   listQuestionSummaries(fileId) -> cau (vung confirmed, trang khong bi loai)
//   pickRandomQuestions({fileId,count,fromPage,toPage}) -> regionId[] ngau nhien
//   createStationSet({fileId,name,feedbackMode,timeLimitSeconds,regionIds}),
//   listStationSets(fileId), deleteStationSet(id), startAttempt({stationSetId}),
//   saveAttemptProgress, resumeAttempt(attemptId), findActiveAttempt(fileId),
//   checkAnswer({attemptId,regionId,submittedText}), submitAttempt(...),
//   getAttemptReview(attemptId), listAttemptHistory(fileId),
//   deleteAttemptHistory(attemptId), createReviewSet({attemptId}) (on cau sai).
//   Luc lam bai renderer KHONG nhan dap an (chi nhan o che + o hoi).
// ============================================================================

export type PracticeNodeKind = 'folder' | 'file'
export type PracticeScanStatus = 'none' | 'scanning' | 'done' | 'failed'
export type PracticeRegionStatus = 'pending' | 'confirmed' | 'rejected'

// ---------- Cay ----------

export interface PracticeNode {
  id: string
  parentId: string | null
  kind: PracticeNodeKind
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// Tom tat de ve cay (chi co o node kind='file').
export interface PracticeFileSummary {
  fileSizeBytes: number
  totalPages: number | null
  scanStatus: PracticeScanStatus
  scanCompleted: boolean
  needsSourceConfirmation: boolean
  regionCount: number
  confirmedCount: number
}

export interface PracticeTreeNode extends PracticeNode {
  file: PracticeFileSummary | null
}

export interface CreatePracticeFolderInput {
  parentId: string | null
  name: string
}

export interface RenamePracticeNodeInput {
  id: string
  name: string
}

// index = vi tri trong danh sach con cua parentId moi (khong co = cuoi danh sach).
export interface MovePracticeNodeInput {
  id: string
  parentId: string | null
  index?: number
}

export interface PracticeAddFilesResult {
  added: PracticeTreeNode[]
  rejected: { path: string; reason: string }[]
}

export interface PracticeSearchResult {
  node: PracticeTreeNode
  // Ten cac thu muc cha tu goc xuong (khong gom node).
  pathNames: string[]
}

// ---------- File ----------

export interface PracticeFile {
  id: string
  name: string
  fileSizeBytes: number
  sourcePath: string | null
  needsSourceConfirmation: boolean
  maskColor: string
  maskOpacity: number
  scanStatus: PracticeScanStatus
  totalPages: number | null
  scanLastPage: number
  scanCompleted: boolean
  regionCount: number
  confirmedCount: number
  createdAt: string
  updatedAt: string
}

export interface UpdatePracticeFileSettingsInput {
  fileId: string
  maskColor?: string // '#rrggbb'
  maskOpacity?: number // 0..1, chi ap dung luc sua; bai thi luon che duc 100%
}

export interface ResetPracticeRegionColorsInput {
  fileId: string
  includeOpacity?: boolean
}

export interface PracticeSourceStatus {
  hasSource: boolean
  sourcePath: string | null
  sourceMissing: boolean
  needsConfirmation: boolean
}

// ---------- Quet ----------

export interface PracticeScanState {
  fileId: string
  status: PracticeScanStatus
  lastPage: number
  totalPages: number | null
  completed: boolean
  running: boolean
}

export interface PracticeScanProgress {
  fileId: string
  phase: 'scanning' | 'done' | 'cancelled' | 'failed'
  pageNumber: number
  totalPages: number
  regionCount: number
  failedPages: number[]
  error?: string
}

export interface PracticeScanResult {
  state: PracticeScanState
  cancelled: boolean
  alreadyComplete: boolean
  alreadyRunning: boolean
  failedPages: number[]
}

// ---------- Vung ----------

export interface PracticeRegion {
  id: string
  fileId: string
  pageNumber: number
  labelBox: Rect
  refWidth: number
  refHeight: number
  rawText: string
  answerText: string | null
  alternates: string[]
  cropBox: Rect | null
  confidence: number | null
  leaderScore: number | null
  suspect: boolean
  /** Ly do nghi rac (chuoi hien thi, co dau) do bo loc rac gan; rong neu khong nghi rac. */
  suspectReasons?: string[]
  status: PracticeRegionStatus
  reviewed: boolean
  colorOverride: string | null
  opacityOverride: number | null
  manual: boolean
  createdAt: string
  updatedAt: string
}

export interface CreatePracticeRegionInput {
  fileId: string
  pageNumber: number
  labelBox: Rect
  refWidth: number
  refHeight: number
  answerText?: string | null
  alternates?: string[]
  cropBox?: Rect | null
  status?: PracticeRegionStatus
  reviewed?: boolean
}

// Moi truong deu tuy chon; status 'confirmed' bat buoc co answerText khong rong
// (sau khi ghep voi gia tri cu).
export interface PracticeRegionPatch {
  labelBox?: Rect
  cropBox?: Rect | null
  rawText?: string
  answerText?: string | null
  alternates?: string[]
  status?: PracticeRegionStatus
  reviewed?: boolean
  colorOverride?: string | null
  opacityOverride?: number | null
}

export interface UpdatePracticeRegionInput {
  id: string
  patch: PracticeRegionPatch
}

export interface PracticePageState {
  pageNumber: number
  reviewed: boolean
  excluded: boolean
}

export interface SetPracticePageReviewInput {
  fileId: string
  pageNumber: number
  reviewed?: boolean
  excluded?: boolean
}

export interface PracticeAiPageReading {
  regionId: string
  reading: AnatomyTextReading | null
  error?: string
  skipped?: boolean
}

// ---------- Bai thi ----------

export interface PracticeQuestionSummary {
  id: string // regionId
  pageNumber: number
  answerText: string
}

export interface PickRandomPracticeQuestionsInput {
  fileId: string
  count: number
  fromPage: number
  toPage: number
}

export interface CreatePracticeStationSetInput {
  fileId: string
  name: string // rong = tu dat ten "De N"
  feedbackMode: AnatomyFeedbackMode
  timeLimitSeconds: number // 0..300 (thi thu phai >= 1)
  regionIds: string[]
}

export interface PracticeStationSet {
  id: string
  fileId: string
  name: string
  feedbackMode: AnatomyFeedbackMode
  timeLimitSeconds: number
  questionCount: number
  isReviewSet: boolean
  createdAt: string
  nextAttemptNumber: number
}

// Moi o che co mau rieng (color_override ?? mau che cua file); bai thi luon duc 100%.
export interface PracticeMaskBox {
  box: Rect
  color: string
}

// Gui xuong renderer LUC LAM BAI - KHONG co answerText/alternates.
export interface PlayablePracticeQuestion {
  regionId: string
  pageNumber: number
  masks: PracticeMaskBox[]
  targetBox: Rect
  refWidth: number
  refHeight: number
  cropBox: Rect | null
}

export interface PracticeAttemptAnswerInput {
  regionId: string
  submittedText: string
}

export interface StartPracticeAttemptInput {
  stationSetId: string
}

export interface StartedPracticeAttempt {
  attemptId: string
  fileId: string
  feedbackMode: AnatomyFeedbackMode
  stationSetId: string | null
  stationSetName: string
  attemptNumber: number
  timeLimitSeconds: number
  currentIndex: number
  remainingMs: number | null
  penaltyDebtMs: number
  questions: PlayablePracticeQuestion[]
  // Cau tra loi da luu (de resume); rong khi moi bat dau.
  answers: PracticeAttemptAnswerInput[]
}

export interface SavePracticeAttemptProgressInput {
  attemptId: string
  currentIndex: number
  remainingMs: number | null
  penaltyDebtMs: number
  answers: PracticeAttemptAnswerInput[]
}

export interface CheckPracticeAnswerInput {
  attemptId: string
  regionId: string
  submittedText: string
}

export interface SubmitPracticeAttemptInput {
  attemptId: string
  durationSeconds: number | null
  answers: PracticeAttemptAnswerInput[]
}

export interface PracticeAttemptAnswerReview {
  regionId: string
  pageNumber: number
  masks: PracticeMaskBox[]
  targetBox: Rect
  refWidth: number
  refHeight: number
  cropBox: Rect | null
  submittedText: string
  correctAnswerText: string
  isCorrect: boolean
}

export interface PracticeAttemptReview {
  attemptId: string
  fileId: string
  feedbackMode: AnatomyFeedbackMode
  correctCount: number
  totalCount: number
  score: number // thang 10
  durationSeconds: number | null
  startedAt: string
  submittedAt: string
  attemptNumber: number
  stationSetName: string
  answers: PracticeAttemptAnswerReview[]
}

export interface PracticeAttemptSummary {
  attemptId: string
  stationSetName: string
  attemptNumber: number
  feedbackMode: AnatomyFeedbackMode
  score: number
  correctCount: number
  totalCount: number
  submittedAt: string
}
