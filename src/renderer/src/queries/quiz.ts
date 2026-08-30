import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UpdateQuestionInput } from '@shared/types/question'
import type { CreateQuizInput, SubmitAttemptInput } from '@shared/types/quiz'
import { useQuizGenerationStore } from '@renderer/stores/quizGenerationStore'
import { useRecentQuestionsStore } from '@renderer/stores/recentQuestionsStore'

export type QuizScope =
  | { type: 'lesson'; lessonId: string }
  | { type: 'topic'; topicId: string; lessonIds: string[] }

export function quizScopeKey(scope: QuizScope): string {
  return scope.type === 'lesson' ? `lesson:${scope.lessonId}` : `topic:${scope.topicId}`
}

export const quizKeys = {
  aiAvailability: ['ai', 'availability'] as const,
  playableLesson: (lessonId: string) => ['quiz', 'playable', 'lesson', lessonId] as const,
  playableTopic: (topicId: string, lessonIds: string[]) =>
    ['quiz', 'playable', 'topic', topicId, [...lessonIds].sort()] as const,
  attemptsLesson: (lessonId: string) => ['quiz', 'attempts', 'lesson', lessonId] as const,
  attemptsTopic: (topicId: string) => ['quiz', 'attempts', 'topic', topicId] as const,
  attemptReview: (attemptId: string) => ['quiz', 'attempt', attemptId] as const
}

function attemptsKeyForScope(scope: QuizScope): readonly unknown[] {
  return scope.type === 'lesson'
    ? quizKeys.attemptsLesson(scope.lessonId)
    : quizKeys.attemptsTopic(scope.topicId)
}

function invalidateQuestionBank(qc: ReturnType<typeof useQueryClient>): void {
  // ['questionBank'] phu ca count / lesson / topic / underTopic
  qc.invalidateQueries({ queryKey: ['questionBank'] })
  qc.invalidateQueries({ queryKey: ['quiz', 'playable'] })
}

// ---------- Availability ----------

export function useAiAvailability() {
  return useQuery({
    queryKey: quizKeys.aiAvailability,
    queryFn: () => window.api.ai.checkAvailability()
  })
}

// ---------- Cau hoi choi duoc ----------

export function usePlayableQuestionsForLesson(lessonId: string | null, enabled = true) {
  return useQuery({
    queryKey: quizKeys.playableLesson(lessonId ?? 'none'),
    queryFn: () => window.api.quiz.listPlayableForLesson(lessonId as string),
    enabled: enabled && lessonId !== null
  })
}

export function usePlayableQuestionsForTopic(
  topicId: string | null,
  lessonIds: string[],
  enabled = true
) {
  return useQuery({
    queryKey: quizKeys.playableTopic(topicId ?? 'none', lessonIds),
    queryFn: () =>
      window.api.quiz.listPlayableForTopic({ topicId: topicId as string, lessonIds }),
    enabled: enabled && topicId !== null && lessonIds.length > 0
  })
}

// ---------- Sinh cau hoi bang AI ----------

// Sinh + luu chay ngoai vong doi component, khoa theo `quizScopeKey(scope)` de
// khong lan trang thai giua cac bai hoc, va luu dung vao pham vi da bam luc do.
export function useQuizGeneration(scope: QuizScope) {
  const qc = useQueryClient()
  const key = quizScopeKey(scope)
  const phase = useQuizGenerationStore((s) => s.phase[key] ?? 'idle')
  const outcome = useQuizGenerationStore((s) => s.outcome[key] ?? null)

  const generate = (numQuestions: number): void => {
    const captured = scope // "chup" pham vi ngay luc bam
    const genStore = useQuizGenerationStore.getState()
    genStore.setPhase(key, 'generating')
    genStore.setOutcome(key, null)
    useRecentQuestionsStore.getState().startGenerating()

    void (async () => {
      try {
        const gen =
          captured.type === 'lesson'
            ? await window.api.ai.generateQuizFromLesson({
                lessonId: captured.lessonId,
                numQuestions
              })
            : await window.api.ai.generateQuizFromLessons({
                lessonIds: captured.lessonIds,
                numQuestions,
                topicId: captured.topicId
              })

        if (!gen.ok || !gen.questions || gen.questions.length === 0) {
          genStore.setPhase(key, 'idle')
          genStore.setOutcome(key, {
            savedCount: 0,
            duplicates: gen.duplicatesRemoved ?? 0,
            truncated: Boolean(gen.truncated),
            error: gen.errorMessage ?? 'Có lỗi xảy ra khi tạo câu hỏi.'
          })
          return
        }

        genStore.setPhase(key, 'saving')
        const saved = await window.api.ai.saveDraftQuestions(
          captured.type === 'lesson'
            ? { questions: gen.questions, lessonId: captured.lessonId }
            : { questions: gen.questions, topicId: captured.topicId }
        )

        useRecentQuestionsStore.getState().markGenerated(saved.map((q) => q.id))
        genStore.setPhase(key, 'idle')
        genStore.setOutcome(key, {
          savedCount: saved.length,
          duplicates: gen.duplicatesRemoved ?? 0,
          truncated: Boolean(gen.truncated),
          error: null
        })
        invalidateQuestionBank(qc)
      } catch {
        genStore.setPhase(key, 'idle')
        genStore.setOutcome(key, {
          savedCount: 0,
          duplicates: 0,
          truncated: false,
          error: 'Không gọi được Claude để tạo câu hỏi. Thử lại nhé.'
        })
      }
    })()
  }

  return { phase, outcome, generate }
}

export function useDeleteQuestion(_scope: QuizScope) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.ai.deleteQuestion(id),
    onSuccess: () => invalidateQuestionBank(qc)
  })
}

export function useUpdateQuestion(_scope: QuizScope) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateQuestionInput) => window.api.ai.updateQuestion(input),
    onSuccess: () => invalidateQuestionBank(qc)
  })
}

export function useReviewQuestions() {
  return useMutation({
    mutationFn: (questionIds: string[]) => window.api.ai.reviewQuestions({ questionIds })
  })
}

// ---------- Lam bai ----------

export function useCreateQuiz() {
  return useMutation({
    mutationFn: (input: CreateQuizInput) => window.api.quiz.create(input)
  })
}

export function useSubmitAttempt(scope: QuizScope) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SubmitAttemptInput) => window.api.quiz.submitAttempt(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attemptsKeyForScope(scope) })
    }
  })
}

// ---------- Lich su ----------

export function useAttemptsByLesson(lessonId: string) {
  return useQuery({
    queryKey: quizKeys.attemptsLesson(lessonId),
    queryFn: () => window.api.quiz.listAttemptsByLesson(lessonId)
  })
}

export function useAttemptsByTopic(topicId: string) {
  return useQuery({
    queryKey: quizKeys.attemptsTopic(topicId),
    queryFn: () => window.api.quiz.listAttemptsByTopic(topicId)
  })
}

export function useAttemptReview(attemptId: string | null) {
  return useQuery({
    queryKey: quizKeys.attemptReview(attemptId ?? 'none'),
    queryFn: () => window.api.quiz.getAttemptReview(attemptId as string),
    enabled: attemptId !== null
  })
}

export function useDeleteAttempt(scope: QuizScope) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attemptId: string) => window.api.quiz.deleteAttempt(attemptId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: attemptsKeyForScope(scope) })
    }
  })
}
