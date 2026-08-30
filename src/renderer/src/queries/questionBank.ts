import { useQuery } from '@tanstack/react-query'

export const questionBankCountQueryKey = ['questionBank', 'count'] as const
export const questionBankByLessonKey = (lessonId: string) =>
  ['questionBank', 'lesson', lessonId] as const
export const questionBankByTopicKey = (topicId: string) =>
  ['questionBank', 'topic', topicId] as const
export const questionBankUnderTopicKey = (topicId: string) =>
  ['questionBank', 'underTopic', topicId] as const

export function useQuestionBankCount() {
  return useQuery({
    queryKey: questionBankCountQueryKey,
    queryFn: () => window.api.questionBank.countAll()
  })
}

export function useQuestionsByLesson(lessonId: string, enabled = true) {
  return useQuery({
    queryKey: questionBankByLessonKey(lessonId),
    queryFn: () => window.api.ai.listQuestionsByLesson(lessonId),
    enabled: enabled && lessonId !== ''
  })
}

export function useQuestionsByTopic(topicId: string) {
  return useQuery({
    queryKey: questionBankByTopicKey(topicId),
    queryFn: () => window.api.ai.listQuestionsByTopic(topicId)
  })
}

export function useQuestionsUnderTopic(topicId: string, enabled = true) {
  return useQuery({
    queryKey: questionBankUnderTopicKey(topicId),
    queryFn: () => window.api.ai.listQuestionsUnderTopic(topicId),
    enabled: enabled && topicId !== ''
  })
}
