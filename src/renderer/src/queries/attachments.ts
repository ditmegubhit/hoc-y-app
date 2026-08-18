import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const attachmentsQueryKey = (lessonId: string) => ['attachments', lessonId] as const

export function useAttachments(lessonId: string) {
  return useQuery({
    queryKey: attachmentsQueryKey(lessonId),
    queryFn: () => window.api.attachments.listByLesson(lessonId)
  })
}

export function useAddAttachment(lessonId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => window.api.attachments.add(lessonId),
    onSuccess: () => qc.invalidateQueries({ queryKey: attachmentsQueryKey(lessonId) })
  })
}

export function useRemoveAttachment(lessonId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.attachments.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: attachmentsQueryKey(lessonId) })
  })
}

export function useReextractAttachment(lessonId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.attachments.reextract(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: attachmentsQueryKey(lessonId) })
  })
}
