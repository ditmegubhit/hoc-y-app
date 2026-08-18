import { useQuery } from '@tanstack/react-query'

export const questionBankCountQueryKey = ['questionBank', 'count'] as const

export function useQuestionBankCount() {
  return useQuery({
    queryKey: questionBankCountQueryKey,
    queryFn: () => window.api.questionBank.countAll()
  })
}
