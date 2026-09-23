import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ConfirmAnatomyCandidateInput,
  CreateAnatomyStationSetInput,
  CreateManualCandidateInput,
  StartAnatomyAttemptInput,
  SubmitAnatomyAttemptInput,
  UpdateAnatomyCandidateInput,
  UpdateQuestionAnswerInput
} from '@shared/types/anatomyQuiz'

export const anatomyKeys = {
  candidatesForPage: (attachmentId: string, pageNumber: number) =>
    ['anatomy', 'candidates', attachmentId, pageNumber] as const,
  confirmedCount: (attachmentId: string) => ['anatomy', 'confirmedCount', attachmentId] as const,
  eligibility: (attachmentId: string) => ['anatomy', 'eligibility', attachmentId] as const,
  stationSets: (attachmentId: string) => ['anatomy', 'stationSets', attachmentId] as const,
  questionSummaries: (attachmentId: string) => ['anatomy', 'questionSummaries', attachmentId] as const,
  attemptHistory: (attachmentId: string) => ['anatomy', 'attemptHistory', attachmentId] as const
}

// ---------- Soan cau hoi ----------

export function useCandidatesForPage(attachmentId: string, pageNumber: number, enabled: boolean) {
  return useQuery({
    queryKey: anatomyKeys.candidatesForPage(attachmentId, pageNumber),
    queryFn: () => window.api.anatomy.listCandidatesForPage({ attachmentId, pageNumber }),
    enabled
  })
}

// Do truoc toan bo tai lieu (chi de tim VI TRI vung chu, khong quan tam OCR
// doc dung chu gi) - dung o man hinh chon pham vi truoc khi bat dau dien dap
// an, tranh moi trang phai cho "Dang do trang...".
export function useDetectAllPages(attachmentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (force: boolean) => window.api.anatomy.detectAllPages({ attachmentId, force }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['anatomy', 'candidates', attachmentId] })
      qc.invalidateQueries({ queryKey: anatomyKeys.confirmedCount(attachmentId) })
      qc.invalidateQueries({ queryKey: anatomyKeys.questionSummaries(attachmentId) })
    }
  })
}

export function useCancelDetectAllPages() {
  return useMutation({ mutationFn: (attachmentId: string) => window.api.anatomy.cancelDetectAllPages(attachmentId) })
}

export function useDetectPage(attachmentId: string, pageNumber: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => window.api.anatomy.detectPage({ attachmentId, pageNumber }),
    onSuccess: (data) => {
      qc.setQueryData(anatomyKeys.candidatesForPage(attachmentId, pageNumber), data)
      qc.invalidateQueries({ queryKey: anatomyKeys.confirmedCount(attachmentId) })
      qc.invalidateQueries({ queryKey: anatomyKeys.questionSummaries(attachmentId) })
    }
  })
}

export function useUpdateCandidate(attachmentId: string, pageNumber: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateAnatomyCandidateInput) => window.api.anatomy.updateCandidate(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: anatomyKeys.candidatesForPage(attachmentId, pageNumber) })
    }
  })
}

export function useCreateManualCandidate(attachmentId: string, pageNumber: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateManualCandidateInput) => window.api.anatomy.createManualCandidate(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: anatomyKeys.candidatesForPage(attachmentId, pageNumber) })
    }
  })
}

export function useConfirmCandidate(attachmentId: string, pageNumber: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ConfirmAnatomyCandidateInput) => window.api.anatomy.confirmCandidate(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: anatomyKeys.candidatesForPage(attachmentId, pageNumber) })
      qc.invalidateQueries({ queryKey: anatomyKeys.confirmedCount(attachmentId) })
    }
  })
}

export function useRejectCandidate(attachmentId: string, pageNumber: number) {
  const qc = useQueryClient()
  return useMutation({
    // Co the la "Bo qua vung" (dang pending) hoac "un-confirm" (dang co dap
    // an, backend tu xoa cau hoi lien ket) - luon invalidate ca confirmedCount
    // vi khong biet truoc truong hop nao.
    mutationFn: (candidateId: string) => window.api.anatomy.rejectCandidate(candidateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: anatomyKeys.candidatesForPage(attachmentId, pageNumber) })
      qc.invalidateQueries({ queryKey: anatomyKeys.confirmedCount(attachmentId) })
    }
  })
}

export function useDeleteCandidate(attachmentId: string, pageNumber: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (candidateId: string) => window.api.anatomy.deleteCandidate(candidateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: anatomyKeys.candidatesForPage(attachmentId, pageNumber) })
      qc.invalidateQueries({ queryKey: anatomyKeys.confirmedCount(attachmentId) })
    }
  })
}

export function useUpdateQuestionAnswer(attachmentId: string, pageNumber: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateQuestionAnswerInput) => window.api.anatomy.updateQuestionAnswer(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: anatomyKeys.candidatesForPage(attachmentId, pageNumber) })
    }
  })
}

export function useAnatomyConfirmedCount(attachmentId: string, enabled = true) {
  return useQuery({
    queryKey: anatomyKeys.confirmedCount(attachmentId),
    queryFn: () => window.api.anatomy.countConfirmedForAttachment(attachmentId),
    enabled
  })
}

export function useAnatomyEligibility(attachmentId: string, enabled = true) {
  return useQuery({
    queryKey: anatomyKeys.eligibility(attachmentId),
    queryFn: () => window.api.anatomy.getEligibility(attachmentId), enabled,
    staleTime: Infinity
  })
}

export function useAnatomyQuestionSummaries(attachmentId: string) {
  return useQuery({
    queryKey: anatomyKeys.questionSummaries(attachmentId),
    queryFn: () => window.api.anatomy.listQuestionSummaries(attachmentId)
  })
}

export function useAnatomyStationSets(attachmentId: string) {
  return useQuery({
    queryKey: anatomyKeys.stationSets(attachmentId),
    queryFn: () => window.api.anatomy.listStationSets(attachmentId)
  })
}

export function useCreateAnatomyStationSet(attachmentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAnatomyStationSetInput) => window.api.anatomy.createStationSet(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: anatomyKeys.stationSets(attachmentId) })
  })
}

export function useDeleteAnatomyStationSet(attachmentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (stationSetId: string) => window.api.anatomy.deleteStationSet(stationSetId),
    onSuccess: () => qc.invalidateQueries({ queryKey: anatomyKeys.stationSets(attachmentId) })
  })
}

// ---------- Lam bai thi ----------

export function useCheckAnatomyAnswer() {
  return useMutation({
    mutationFn: (input: { questionId: string; submittedText: string }) =>
      window.api.anatomy.checkAnswer(input)
  })
}

export function useStartAnatomyAttempt() {
  return useMutation({
    mutationFn: (input: StartAnatomyAttemptInput) => window.api.anatomy.startAttempt(input)
  })
}

export function useSubmitAnatomyAttempt(attachmentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SubmitAnatomyAttemptInput) => window.api.anatomy.submitAttempt(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: anatomyKeys.confirmedCount(attachmentId) })
      qc.invalidateQueries({ queryKey: anatomyKeys.attemptHistory(attachmentId) })
    }
  })
}

export function useAnatomyAttemptHistory(attachmentId: string) {
  return useQuery({
    queryKey: anatomyKeys.attemptHistory(attachmentId),
    queryFn: () => window.api.anatomy.listAttemptHistory(attachmentId)
  })
}

export function useDeleteAnatomyAttemptHistory(attachmentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attemptId: string) => window.api.anatomy.deleteAttemptHistory(attemptId),
    onSuccess: () => qc.invalidateQueries({ queryKey: anatomyKeys.attemptHistory(attachmentId) })
  })
}
