import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateTopicInput, UpdateTopicInput } from '@shared/types/topic'

export const topicsQueryKey = ['topics'] as const

export function useTopics() {
  return useQuery({ queryKey: topicsQueryKey, queryFn: () => window.api.topics.list() })
}

export function useCreateTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTopicInput) => window.api.topics.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: topicsQueryKey })
  })
}

export function useUpdateTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateTopicInput) => window.api.topics.update(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: topicsQueryKey })
  })
}

export function useDeleteTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.topics.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: topicsQueryKey })
      qc.invalidateQueries({ queryKey: ['lessons'] })
    }
  })
}
