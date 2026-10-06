import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  CheckPracticeAnswerInput,
  CreatePracticeFolderInput,
  CreatePracticeRegionInput,
  CreatePracticeStationSetInput,
  MovePracticeNodeInput,
  PickRandomPracticeQuestionsInput,
  PracticeRegion,
  PracticeScanProgress,
  RenamePracticeNodeInput,
  ResetPracticeRegionColorsInput,
  SavePracticeAttemptProgressInput,
  SetPracticePageReviewInput,
  StartPracticeAttemptInput,
  SubmitPracticeAttemptInput,
  UpdatePracticeFileSettingsInput,
  UpdatePracticeRegionInput
} from '@shared/types/practice'

// Hook react-query cho khu Thuc hanh Giai phau (mo ta API: shared/types/practice.ts).

export const practiceKeys = {
  nodes: ['practice', 'nodes'] as const,
  search: (keyword: string) => ['practice', 'search', keyword] as const,
  file: (fileId: string) => ['practice', 'file', fileId] as const,
  sourceStatus: (fileId: string) => ['practice', 'sourceStatus', fileId] as const,
  scanState: (fileId: string) => ['practice', 'scanState', fileId] as const,
  regions: (fileId: string) => ['practice', 'regions', fileId] as const,
  regionsForPage: (fileId: string, pageNumber: number) => ['practice', 'regions', fileId, 'page', pageNumber] as const,
  regionsForFile: (fileId: string) => ['practice', 'regions', fileId, 'file'] as const,
  pageStates: (fileId: string) => ['practice', 'pageStates', fileId] as const,
  questionSummaries: (fileId: string) => ['practice', 'questionSummaries', fileId] as const,
  stationSets: (fileId: string) => ['practice', 'stationSets', fileId] as const,
  attemptHistory: (fileId: string) => ['practice', 'attemptHistory', fileId] as const,
  activeAttempt: (fileId: string) => ['practice', 'activeAttempt', fileId] as const
}

// Doi vung thi dem cau/so vung tren cay + cau hoi dung de tao bai thi cung doi theo.
function invalidateAfterRegionChange(qc: QueryClient, fileId: string): void {
  qc.invalidateQueries({ queryKey: practiceKeys.nodes })
  qc.invalidateQueries({ queryKey: practiceKeys.file(fileId) })
  qc.invalidateQueries({ queryKey: practiceKeys.questionSummaries(fileId) })
}

// Ghi vung vua sua/tao vao cache danh sach (tranh nhap nhay do refetch).
function upsertRegionInCaches(qc: QueryClient, region: PracticeRegion): void {
  qc.setQueryData<PracticeRegion[]>(practiceKeys.regionsForPage(region.fileId, region.pageNumber), (old) =>
    old ? (old.some((r) => r.id === region.id) ? old.map((r) => (r.id === region.id ? region : r)) : [...old, region]) : old)
  qc.setQueryData<PracticeRegion[]>(practiceKeys.regionsForFile(region.fileId), (old) =>
    old ? (old.some((r) => r.id === region.id) ? old.map((r) => (r.id === region.id ? region : r)) : [...old, region]) : old)
}

// ---------- Cay ----------

export function usePracticeNodes() {
  return useQuery({ queryKey: practiceKeys.nodes, queryFn: () => window.api.practice.listNodes() })
}

export function usePracticeSearch(keyword: string) {
  const trimmed = keyword.trim()
  return useQuery({
    queryKey: practiceKeys.search(trimmed),
    queryFn: () => window.api.practice.search(trimmed),
    enabled: trimmed.length > 0
  })
}

export function useCreatePracticeFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePracticeFolderInput) => window.api.practice.createFolder(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: practiceKeys.nodes })
  })
}

export function useRenamePracticeNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RenamePracticeNodeInput) => window.api.practice.renameNode(input),
    onSuccess: (node) => {
      qc.invalidateQueries({ queryKey: practiceKeys.nodes })
      qc.invalidateQueries({ queryKey: practiceKeys.file(node.id) })
      qc.invalidateQueries({ queryKey: ['practice', 'search'] })
    }
  })
}

export function useMovePracticeNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: MovePracticeNodeInput) => window.api.practice.moveNode(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: practiceKeys.nodes })
  })
}

export function useDeletePracticeNode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.practice.deleteNode(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['practice'] })
    }
  })
}

/** Nut "Them file": mo hop thoai chon PDF. */
export function usePickAndAddPracticeFiles() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (parentId: string | null) => window.api.practice.pickAndAddFiles(parentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: practiceKeys.nodes })
  })
}

/** Keo-tha tu Explorer: paths = files.map(window.api.practice.getPathForFile). */
export function useAddPracticeFilesFromPaths() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { parentId: string | null; paths: string[] }) =>
      window.api.practice.addFilesFromPaths(input.parentId, input.paths),
    onSuccess: () => qc.invalidateQueries({ queryKey: practiceKeys.nodes })
  })
}

/** Goi 1 lan o cap ung dung: file doi do dong bo voi file goc -> lam moi cay + file. */
export function usePracticeFilesUpdated(): void {
  const qc = useQueryClient()
  useEffect(
    () =>
      window.api.practice.onFilesUpdated((fileId) => {
        qc.invalidateQueries({ queryKey: practiceKeys.nodes })
        qc.invalidateQueries({ queryKey: practiceKeys.file(fileId) })
        qc.invalidateQueries({ queryKey: practiceKeys.sourceStatus(fileId) })
        qc.invalidateQueries({ queryKey: practiceKeys.regions(fileId) })
      }),
    [qc]
  )
}

// ---------- File ----------

export function usePracticeFile(fileId: string | null) {
  return useQuery({
    queryKey: practiceKeys.file(fileId ?? ''),
    queryFn: () => window.api.practice.getFile(fileId as string),
    enabled: fileId !== null
  })
}

export function useUpdatePracticeFileSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdatePracticeFileSettingsInput) => window.api.practice.updateFileSettings(input),
    onSuccess: (file) => qc.setQueryData(practiceKeys.file(file.id), file)
  })
}

export function useResetPracticeRegionColors(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input?: Omit<ResetPracticeRegionColorsInput, 'fileId'>) =>
      window.api.practice.resetRegionColors({ fileId, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: practiceKeys.regions(fileId) })
  })
}

export function usePracticeSourceStatus(fileId: string | null) {
  return useQuery({
    queryKey: practiceKeys.sourceStatus(fileId ?? ''),
    queryFn: () => window.api.practice.getSourceStatus(fileId as string),
    enabled: fileId !== null
  })
}

export function useSyncPracticeSource(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => window.api.practice.syncSource(fileId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: practiceKeys.file(fileId) })
      qc.invalidateQueries({ queryKey: practiceKeys.sourceStatus(fileId) })
      qc.invalidateQueries({ queryKey: practiceKeys.nodes })
    }
  })
}

export function useResolvePracticeSourceChange(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (isSimilar: boolean) => window.api.practice.resolveSourceChange({ fileId, isSimilar }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['practice'] })
    }
  })
}

// ---------- Quet ----------

export function usePracticeScanState(fileId: string | null) {
  return useQuery({
    queryKey: practiceKeys.scanState(fileId ?? ''),
    queryFn: () => window.api.practice.getScanState(fileId as string),
    enabled: fileId !== null
  })
}

/** Quet ca file; mutation hoan tat khi quet xong (hoac bi huy). Dung cung usePracticeScanProgress de hien tien do. */
export function useScanPracticeFile(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (force: boolean) => window.api.practice.scanFile({ fileId, force }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: practiceKeys.regions(fileId) })
      qc.invalidateQueries({ queryKey: practiceKeys.scanState(fileId) })
      qc.invalidateQueries({ queryKey: practiceKeys.file(fileId) })
      qc.invalidateQueries({ queryKey: practiceKeys.nodes })
      qc.invalidateQueries({ queryKey: practiceKeys.questionSummaries(fileId) })
    }
  })
}

export function useCancelPracticeScan() {
  return useMutation({ mutationFn: (fileId: string) => window.api.practice.cancelScan(fileId) })
}

/** Tien do quet moi nhat cua file (null khi chua co su kien). Tu lam moi vung/trang thai moi khi xong. */
export function usePracticeScanProgress(fileId: string | null): PracticeScanProgress | null {
  const qc = useQueryClient()
  const [progress, setProgress] = useState<PracticeScanProgress | null>(null)
  useEffect(() => {
    setProgress(null)
    if (fileId === null) return
    return window.api.practice.onScanProgress((payload) => {
      if (payload.fileId !== fileId) return
      setProgress(payload)
      if (payload.phase !== 'scanning') {
        qc.invalidateQueries({ queryKey: practiceKeys.scanState(fileId) })
        qc.invalidateQueries({ queryKey: practiceKeys.file(fileId) })
        qc.invalidateQueries({ queryKey: practiceKeys.regions(fileId) })
        qc.invalidateQueries({ queryKey: practiceKeys.nodes })
      }
    })
  }, [fileId, qc])
  return progress
}

// ---------- Vung ----------

export function usePracticeRegionsForPage(fileId: string, pageNumber: number, enabled = true) {
  return useQuery({
    queryKey: practiceKeys.regionsForPage(fileId, pageNumber),
    queryFn: () => window.api.practice.listRegionsForPage({ fileId, pageNumber }),
    enabled
  })
}

export function usePracticeRegionsForFile(fileId: string | null) {
  return useQuery({
    queryKey: practiceKeys.regionsForFile(fileId ?? ''),
    queryFn: () => window.api.practice.listRegionsForFile(fileId as string),
    enabled: fileId !== null
  })
}

export function useCreatePracticeRegion(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<CreatePracticeRegionInput, 'fileId'>) =>
      window.api.practice.createRegion({ ...input, fileId }),
    onSuccess: (region) => {
      upsertRegionInCaches(qc, region)
      invalidateAfterRegionChange(qc, fileId)
    }
  })
}

export function useUpdatePracticeRegion(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdatePracticeRegionInput) => window.api.practice.updateRegion(input),
    onSuccess: (region) => {
      upsertRegionInCaches(qc, region)
      invalidateAfterRegionChange(qc, fileId)
    }
  })
}

export function useDeletePracticeRegion(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.practice.deleteRegion(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: practiceKeys.regions(fileId) })
      invalidateAfterRegionChange(qc, fileId)
    }
  })
}

/** Hoan tac xoa: truyen lai nguyen object vung vua xoa. */
export function useRestorePracticeRegion(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (region: PracticeRegion) => window.api.practice.restoreRegion(region),
    onSuccess: (region) => {
      upsertRegionInCaches(qc, region)
      qc.invalidateQueries({ queryKey: practiceKeys.regions(fileId) })
      invalidateAfterRegionChange(qc, fileId)
    }
  })
}

export function useReadPracticeRegionWithAi() {
  return useMutation({ mutationFn: (regionId: string) => window.api.practice.readRegionWithAi(regionId) })
}

export function useReadPracticePageWithAi(fileId: string) {
  return useMutation({
    mutationFn: (pageNumber: number) => window.api.practice.readPageWithAi({ fileId, pageNumber })
  })
}

export function usePracticePageStates(fileId: string | null) {
  return useQuery({
    queryKey: practiceKeys.pageStates(fileId ?? ''),
    queryFn: () => window.api.practice.listPageStates(fileId as string),
    enabled: fileId !== null
  })
}

export function useSetPracticePageReview(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<SetPracticePageReviewInput, 'fileId'>) =>
      window.api.practice.setPageReview({ ...input, fileId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: practiceKeys.pageStates(fileId) })
      qc.invalidateQueries({ queryKey: practiceKeys.questionSummaries(fileId) })
    }
  })
}

// ---------- Bai thi ----------

export function usePracticeQuestionSummaries(fileId: string | null) {
  return useQuery({
    queryKey: practiceKeys.questionSummaries(fileId ?? ''),
    queryFn: () => window.api.practice.listQuestionSummaries(fileId as string),
    enabled: fileId !== null
  })
}

/** Chon ngau nhien N cau trong khoang trang; tra ve regionId[] (UI tick san, van bo/them tay duoc). */
export function usePickRandomPracticeQuestions() {
  return useMutation({
    mutationFn: (input: PickRandomPracticeQuestionsInput) => window.api.practice.pickRandomQuestions(input)
  })
}

export function usePracticeStationSets(fileId: string | null) {
  return useQuery({
    queryKey: practiceKeys.stationSets(fileId ?? ''),
    queryFn: () => window.api.practice.listStationSets(fileId as string),
    enabled: fileId !== null
  })
}

export function useCreatePracticeStationSet(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<CreatePracticeStationSetInput, 'fileId'>) =>
      window.api.practice.createStationSet({ ...input, fileId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: practiceKeys.stationSets(fileId) })
  })
}

export function useDeletePracticeStationSet(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (stationSetId: string) => window.api.practice.deleteStationSet(stationSetId),
    onSuccess: () => qc.invalidateQueries({ queryKey: practiceKeys.stationSets(fileId) })
  })
}

export function useStartPracticeAttempt(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: StartPracticeAttemptInput) => window.api.practice.startAttempt(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: practiceKeys.stationSets(fileId) })
      qc.invalidateQueries({ queryKey: practiceKeys.activeAttempt(fileId) })
    }
  })
}

export function useSavePracticeAttemptProgress() {
  return useMutation({
    mutationFn: (input: SavePracticeAttemptProgressInput) => window.api.practice.saveAttemptProgress(input)
  })
}

export function useResumePracticeAttempt() {
  return useMutation({ mutationFn: (attemptId: string) => window.api.practice.resumeAttempt(attemptId) })
}

/** attemptId cua luot dang lam do (de hoi "tiep tuc?"), null neu khong co. */
export function usePracticeActiveAttempt(fileId: string | null) {
  return useQuery({
    queryKey: practiceKeys.activeAttempt(fileId ?? ''),
    queryFn: () => window.api.practice.findActiveAttempt(fileId as string),
    enabled: fileId !== null
  })
}

export function useCheckPracticeAnswer() {
  return useMutation({ mutationFn: (input: CheckPracticeAnswerInput) => window.api.practice.checkAnswer(input) })
}

export function useSubmitPracticeAttempt(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SubmitPracticeAttemptInput) => window.api.practice.submitAttempt(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: practiceKeys.attemptHistory(fileId) })
      qc.invalidateQueries({ queryKey: practiceKeys.stationSets(fileId) })
      qc.invalidateQueries({ queryKey: practiceKeys.activeAttempt(fileId) })
    }
  })
}

export function usePracticeAttemptReview() {
  return useMutation({ mutationFn: (attemptId: string) => window.api.practice.getAttemptReview(attemptId) })
}

export function usePracticeAttemptHistory(fileId: string | null) {
  return useQuery({
    queryKey: practiceKeys.attemptHistory(fileId ?? ''),
    queryFn: () => window.api.practice.listAttemptHistory(fileId as string),
    enabled: fileId !== null
  })
}

export function useDeletePracticeAttemptHistory(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attemptId: string) => window.api.practice.deleteAttemptHistory(attemptId),
    onSuccess: () => qc.invalidateQueries({ queryKey: practiceKeys.attemptHistory(fileId) })
  })
}

/** "On cau sai": tao bo de tu cac cau sai cua 1 luot da nop (che do luyen tap). Tra ve PracticeStationSet de startAttempt ngay. */
export function useCreatePracticeReviewSet(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attemptId: string) => window.api.practice.createReviewSet(attemptId),
    onSuccess: () => qc.invalidateQueries({ queryKey: practiceKeys.stationSets(fileId) })
  })
}
