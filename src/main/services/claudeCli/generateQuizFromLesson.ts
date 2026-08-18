import { z } from 'zod'
import { runClaudeHeadless } from './claudeCliClient'
import {
  buildQuizFromLessonPrompt,
  quizFromLessonJsonSchema
} from './promptTemplates/quizFromLesson.prompt'
import * as lessonsRepo from '../../db/repositories/lessons.repo'
import * as attachmentsRepo from '../../db/repositories/attachments.repo'
import type { DraftQuestion } from '../../../shared/types/question'
import type { GenerateQuizFromLessonResult } from '../../../shared/types/claudeCli'

const structuredOutputSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string().min(1),
      options: z.array(z.object({ text: z.string().min(1), isCorrect: z.boolean() })).min(2),
      explanation: z.string().optional()
    })
  )
})

export async function generateQuizFromLesson(params: {
  lessonId: string
  numQuestions: number
}): Promise<GenerateQuizFromLessonResult> {
  const lesson = lessonsRepo.getLesson(params.lessonId)
  if (!lesson) return { ok: false, errorMessage: 'Không tìm thấy bài học.' }

  const attachments = attachmentsRepo.listAttachmentsByLesson(params.lessonId)
  const contentPieces: { label: string; text: string }[] = []
  if (lesson.notesText?.trim()) {
    contentPieces.push({ label: 'Ghi chú bài học', text: lesson.notesText })
  }
  for (const att of attachments) {
    if (att.extractionStatus === 'done' && att.extractedText?.trim()) {
      contentPieces.push({ label: `File: ${att.fileName}`, text: att.extractedText })
    }
  }

  if (contentPieces.length === 0) {
    return {
      ok: false,
      errorMessage:
        'Bài học chưa có ghi chú hoặc file đính kèm nào có nội dung để tạo câu hỏi.'
    }
  }

  const { prompt, truncated } = buildQuizFromLessonPrompt({
    lessonTitle: lesson.title,
    contentPieces,
    numQuestions: params.numQuestions
  })

  const result = await runClaudeHeadless({
    prompt,
    jsonSchema: quizFromLessonJsonSchema,
    timeoutMs: 180_000
  })

  if (!result.ok) {
    return { ok: false, errorMessage: result.errorMessage }
  }

  const parsed = structuredOutputSchema.safeParse(result.structuredOutput)
  if (!parsed.success) {
    return { ok: false, errorMessage: 'Claude trả về dữ liệu không đúng định dạng mong đợi.' }
  }

  const questions: DraftQuestion[] = parsed.data.questions.map((q) => ({
    questionText: q.question,
    options: q.options.map((opt, idx) => ({
      id: String.fromCharCode(97 + idx),
      text: opt.text,
      isCorrect: opt.isCorrect
    })),
    explanation: q.explanation ?? null
  }))

  return { ok: true, questions, truncated }
}
