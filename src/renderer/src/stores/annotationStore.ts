import { create } from 'zustand'
import type { HighlightColor, NewAnnotation } from '@shared/types/annotation'

export type AnnotationTool = 'none' | 'select' | 'highlight' | 'pencil' | 'note' | 'eraser'

interface AnnotationState {
  attachmentId: string | null
  annotations: NewAnnotation[]
  history: NewAnnotation[][]
  batchSnapshot: NewAnnotation[] | null
  isDirty: boolean
  tool: AnnotationTool
  color: HighlightColor
  // Mau CHU rieng (chi ap dung cho hop ghi chu) - tach khoi "color" o tren
  // (mau NEN/to cua highlight, hop ghi chu, but chi).
  textColor: HighlightColor
  strokeWidth: number
  eraserRadius: number
  // Chi tiet (highlight/pencil/note) dang duoc chon (nhan dup hoac cong cu
  // "Chon") - de doi mau/xoa truc tiep 1 chi tiet cu the, thay vi phai to/
  // xoa lai.
  selectedId: string | null

  loadAnnotations: (attachmentId: string, annotations: NewAnnotation[]) => void
  setTool: (tool: AnnotationTool) => void
  setColor: (color: HighlightColor) => void
  setTextColor: (color: HighlightColor) => void
  setStrokeWidth: (width: number) => void
  setEraserRadius: (radius: number) => void
  setSelectedId: (id: string | null) => void
  addAnnotation: (annotation: NewAnnotation) => void
  updateAnnotation: (id: string, data: NewAnnotation['data']) => void
  recolorAnnotation: (id: string, color: HighlightColor) => void
  // Doi mau CHU cua 1 hop ghi chu cu the (khong lam gi neu id khong phai
  // hop ghi chu - highlight/but chi khong co khai niem mau chu rieng).
  recolorNoteText: (id: string, textColor: HighlightColor) => void
  removeAnnotation: (id: string) => void
  // Batch = 1 lan keo tay xoa tu do (co the sinh nhieu thay doi lien tiep
  // trong luc keo) - gop lai thanh DUY NHAT 1 buoc undo, thay vi push
  // history moi frame gay "Quay lai" phai bam nhieu lan moi het 1 net xoa.
  beginBatch: () => void
  setAnnotationsSilent: (next: NewAnnotation[]) => void
  commitBatch: () => void
  abortBatch: () => void
  rollbackBatch: () => void
  undo: () => void
  markSaved: () => void
  reset: () => void
}

// State chia se giua AnnotationToolbox (nam ngoai panel, ben phai) va
// AnnotationLayer (nam sau trong tung trang cua PdfImageViewer) - dung
// zustand thay vi truyen prop qua nhieu tang. history luu snapshot toan bo
// mang annotations truoc moi thay doi (don gian, du dung voi so luong net
// nho, khong can undo tung buoc phuc tap).
export const useAnnotationStore = create<AnnotationState>((set) => ({
  attachmentId: null,
  annotations: [],
  history: [],
  batchSnapshot: null,
  isDirty: false,
  tool: 'none',
  color: 'yellow',
  textColor: 'none',
  strokeWidth: 3,
  eraserRadius: 12,
  selectedId: null,

  loadAnnotations: (attachmentId, annotations) =>
    set({ attachmentId, annotations, history: [], isDirty: false, tool: 'none', selectedId: null }),

  setTool: (tool) => set({ tool, selectedId: null }),
  setColor: (color) => set({ color }),
  setTextColor: (textColor) => set({ textColor }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  setEraserRadius: (eraserRadius) => set({ eraserRadius }),
  setSelectedId: (selectedId) => set({ selectedId }),

  addAnnotation: (annotation) =>
    set((state) => ({
      history: [...state.history, state.annotations],
      annotations: [...state.annotations, annotation],
      isDirty: true
    })),

  updateAnnotation: (id, data) =>
    set((state) => ({
      history: [...state.history, state.annotations],
      annotations: state.annotations.map((a) => (a.id === id ? { ...a, data } : a)),
      isDirty: true
    })),

  recolorAnnotation: (id, color) =>
    set((state) => {
      const target = state.annotations.find((a) => a.id === id)
      if (!target) return state
      return {
        history: [...state.history, state.annotations],
        annotations: state.annotations.map((a) =>
          a.id === id ? { ...a, data: { ...a.data, color } } : a
        ),
        isDirty: true
      }
    }),

  recolorNoteText: (id, textColor) =>
    set((state) => {
      const target = state.annotations.find((a) => a.id === id)
      if (!target || target.type !== 'note') return state
      return {
        history: [...state.history, state.annotations],
        annotations: state.annotations.map((a) =>
          a.id === id ? { ...a, data: { ...a.data, textColor } } : a
        ),
        isDirty: true
      }
    }),

  removeAnnotation: (id) =>
    set((state) => ({
      history: [...state.history, state.annotations],
      annotations: state.annotations.filter((a) => a.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
      isDirty: true
    })),

  beginBatch: () => set((state) => ({ batchSnapshot: state.annotations })),

  setAnnotationsSilent: (next) => set({ annotations: next, isDirty: true }),

  commitBatch: () =>
    set((state) => {
      if (!state.batchSnapshot) return state
      return { history: [...state.history, state.batchSnapshot], batchSnapshot: null }
    }),

  // Dung khi 1 thao tac keo (di chuyen/resize hop ghi chu) hoa ra chi la 1
  // cai bam khong keo gi ca - huy batch ma khong ghi vao lich su, tranh
  // "Quay lai" bi thua 1 buoc khong lam gi ca.
  abortBatch: () => set({ batchSnapshot: null }),

  // Khac abortBatch: dung khi batch DA thuc su thay doi annotations (vd
  // dang xoa dang do) nhung bi ngat giua chung (vd ngon tay thu 2 cham vao
  // de pinch-zoom) - phai TRA LAI annotations ve dung luc truoc khi batch
  // bat dau, khong chi bo qua viec ghi lich su.
  rollbackBatch: () =>
    set((state) => {
      if (!state.batchSnapshot) return state
      return { annotations: state.batchSnapshot, batchSnapshot: null }
    }),

  undo: () =>
    set((state) => {
      if (state.history.length === 0) return state
      const previous = state.history[state.history.length - 1]
      return {
        annotations: previous,
        history: state.history.slice(0, -1),
        isDirty: true
      }
    }),

  markSaved: () => set({ isDirty: false }),

  reset: () =>
    set({
      attachmentId: null,
      annotations: [],
      history: [],
      isDirty: false,
      tool: 'none',
      selectedId: null
    })
}))
