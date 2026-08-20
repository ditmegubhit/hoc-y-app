import { useAnnotationStore } from '@renderer/stores/annotationStore'

// Dung chung cho ca nut "Luu" trong AnnotationToolbox lan luong xu ly khi
// dong panel/doi file luc con thay doi chua luu (xem LessonWorkspacePage.tsx)
// - doc snapshot hien tai cua store bang getState() (khong can subscribe).
export async function persistAnnotations(attachmentId: string): Promise<void> {
  const { annotations, markSaved } = useAnnotationStore.getState()
  await window.api.attachments.saveAnnotations({ attachmentId, annotations })
  markSaved()
}
