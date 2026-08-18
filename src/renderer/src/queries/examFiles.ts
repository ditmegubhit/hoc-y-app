import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const examFilesQueryKey = ['examFiles'] as const

export function useExamFiles() {
  return useQuery({
    queryKey: examFilesQueryKey,
    queryFn: () => window.api.examFiles.list(),
    // Khong co IPC push event rieng cho exam files (khac attachments) - vi
    // day chi la khung ban dau, polling nhe trong luc con file dang trich
    // xuat la du, don gian hon.
    refetchInterval: (query) => {
      const hasPending = query.state.data?.some((f) => f.extractionStatus === 'pending')
      return hasPending ? 1500 : false
    }
  })
}

export function useAddExamFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => window.api.examFiles.add(),
    onSuccess: () => qc.invalidateQueries({ queryKey: examFilesQueryKey })
  })
}

export function useRemoveExamFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.examFiles.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: examFilesQueryKey })
  })
}
