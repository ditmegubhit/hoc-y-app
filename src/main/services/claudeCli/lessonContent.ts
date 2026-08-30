import * as lessonsRepo from '../../db/repositories/lessons.repo'
import * as attachmentsRepo from '../../db/repositories/attachments.repo'

export interface ContentPiece {
  label: string
  text: string
}

export interface CollectedLessonContent {
  pieces: ContentPiece[]
  missing: string[] // lessonId khong tim thay
}

/**
 * Gom noi dung (ghi chu + text da trich tu file dinh kem) cua mot hoac nhieu
 * bai hoc, de lam nguyen lieu cho Claude sinh cau hoi.
 */
export function collectLessonContentPieces(lessonIds: string[]): CollectedLessonContent {
  const pieces: ContentPiece[] = []
  const missing: string[] = []

  for (const lessonId of lessonIds) {
    const lesson = lessonsRepo.getLesson(lessonId)
    if (!lesson) {
      missing.push(lessonId)
      continue
    }

    if (lesson.notesText?.trim()) {
      pieces.push({ label: `Ghi chú — ${lesson.title}`, text: lesson.notesText })
    }

    for (const att of attachmentsRepo.listAttachmentsByLesson(lessonId)) {
      if (att.extractionStatus === 'done' && att.extractedText?.trim()) {
        pieces.push({
          label: `File: ${lesson.title} / ${att.fileName}`,
          text: att.extractedText
        })
      }
    }
  }

  return { pieces, missing }
}
