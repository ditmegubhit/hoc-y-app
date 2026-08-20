import { useQuery } from '@tanstack/react-query'

export function usePageCount(attachmentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['attachmentPageCount', attachmentId],
    queryFn: () => window.api.attachments.getPageCount({ attachmentId }),
    enabled,
    staleTime: Infinity
  })
}

export function usePageImage(
  attachmentId: string,
  unitType: string,
  unitIndex: number,
  enabled: boolean
) {
  return useQuery({
    queryKey: ['attachmentPageImage', attachmentId, unitType, unitIndex],
    queryFn: () => window.api.attachments.getPageImage({ attachmentId, unitType, unitIndex }),
    enabled,
    staleTime: Infinity
  })
}
