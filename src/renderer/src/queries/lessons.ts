import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LessonSummary, CreateLessonInput, UpdateLessonInput } from '@shared/types/lesson'

export const lessonsQueryKey = ['lessons'] as const
export const lessonQueryKey = (id: string) => ['lessons', id] as const
export const recentLessonsQueryKey = ['lessons', 'recent'] as const

function toSummary(lesson: {
  id: string
  topicId: string
  title: string
  sortOrder: number
}): LessonSummary {
  return { id: lesson.id, topicId: lesson.topicId, title: lesson.title, sortOrder: lesson.sortOrder }
}

export function useLessons() {
  return useQuery({ queryKey: lessonsQueryKey, queryFn: () => window.api.lessons.listAll() })
}

export function useRecentLessons(limit = 5) {
  return useQuery({
    queryKey: recentLessonsQueryKey,
    queryFn: () => window.api.lessons.listRecent(limit)
  })
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
    // Ghi thang vao cache thay vi invalidate+refetch, tranh rebuild cay giua
    // luc react-arborist tu dong vao che do doi ten sau khi tao moi.
    onSuccess: (lesson) => {
      qc.setQueryData<LessonSummary[]>(lessonsQueryKey, (old) => [
        ...(old ?? []),
        toSummary(lesson)
      ])
      qc.invalidateQueries({ queryKey: recentLessonsQueryKey })
    }
  })
}

export function useUpdateLesson() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateLessonInput) => window.api.lessons.update(input),
    onSuccess: (lesson) => {
      qc.setQueryData<LessonSummary[]>(lessonsQueryKey, (old) =>
        (old ?? []).map((l) => (l.id === lesson.id ? toSummary(lesson) : l))
      )
      qc.setQueryData(lessonQueryKey(lesson.id), lesson)
      qc.invalidateQueries({ queryKey: recentLessonsQueryKey })
    }
  })
}

export function useDeleteLesson() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.lessons.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lessonsQueryKey })
      qc.invalidateQueries({ queryKey: recentLessonsQueryKey })
    }
  })
}
