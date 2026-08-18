import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Topic, CreateTopicInput, UpdateTopicInput } from '@shared/types/topic'

export const topicsQueryKey = ['topics'] as const

export function useTopics() {
  return useQuery({ queryKey: topicsQueryKey, queryFn: () => window.api.topics.list() })
}

export function useCreateTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTopicInput) => window.api.topics.create(input),
    // Ghi thang vao cache (khong invalidate+refetch) de tranh rebuild toan bo
    // cay ngay trong luc react-arborist dang tu dong vao che do doi ten sau
    // khi tao moi - refetch giua chung se lam mat focus/ky tu dang go.
    onSuccess: (topic) => {
      qc.setQueryData<Topic[]>(topicsQueryKey, (old) => [...(old ?? []), topic])
    }
  })
}

export function useUpdateTopic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateTopicInput) => window.api.topics.update(input),
    onSuccess: (topic) => {
      qc.setQueryData<Topic[]>(topicsQueryKey, (old) =>
        (old ?? []).map((t) => (t.id === topic.id ? topic : t))
      )
    }
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
