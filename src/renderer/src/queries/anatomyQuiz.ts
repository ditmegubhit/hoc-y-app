import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ConfirmAnatomyCandidateInput,
  CreateManualCandidateInput,
  StartAnatomyAttemptInput,
  SubmitAnatomyAttemptInput,
  UpdateAnatomyCandidateInput,
  UpdateQuestionAnswerInput
} from '@shared/types/anatomyQuiz'

export const anatomyKeys = {
  candidatesForPage: (attachmentId: string, pageNumber: number) =>
    ['anatomy', 'candidates', attachmentId, pageNumber] as const,
  confirmedCount: (attachmentId: string) => ['anatomy', 'confirmedCount', attachmentId] as const
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
    mutationFn: () => window.api.anatomy.detectAllPages({ attachmentId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['anatomy', 'candidates', attachmentId] })
    }
  })
}

export function useDetectPage(attachmentId: string, pageNumber: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => window.api.anatomy.detectPage({ attachmentId, pageNumber }),
    onSuccess: (data) => {
      qc.setQueryData(anatomyKeys.candidatesForPage(attachmentId, pageNumber), data)
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
    }
  })
}
