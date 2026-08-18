import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateLessonInput, UpdateLessonInput } from '@shared/types/lesson'

export const lessonsQueryKey = ['lessons'] as const
export const lessonQueryKey = (id: string) => ['lessons', id] as const

export function useLessons() {
  return useQuery({ queryKey: lessonsQueryKey, queryFn: () => window.api.lessons.listAll() })
}

export function useLesson(id: string | null) {
  return useQuery({
    queryKey: lessonQueryKey(id ?? 'none'),
    queryFn: () => window.api.lessons.get(id as string),
    enabled: id !== null
  })
}

export function useCreateLesson() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLessonInput) => window.api.lessons.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: lessonsQueryKey })
  })
}

export function useUpdateLesson() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateLessonInput) => window.api.lessons.update(input),
    onSuccess: (lesson) => {
      qc.invalidateQueries({ queryKey: lessonsQueryKey })
      qc.invalidateQueries({ queryKey: lessonQueryKey(lesson.id) })
    }
  })
}

export function useDeleteLesson() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.lessons.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: lessonsQueryKey })
  })
}
