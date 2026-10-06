import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { CreatePracticeRegionInput, PracticeRegion, PracticeRegionPatch } from '@shared/types/practice'
import {
  applyPatchToRegion,
  buildInversePatch,
  patchChangesRegion,
  popUndo,
  pushUndo,
  type EditAction
} from '@shared/practice/editLogic'
import { errorText } from '@shared/practice/quizLogic'
import {
  practiceKeys,
  useCreatePracticeRegion,
  useDeletePracticeRegion,
  useRestorePracticeRegion,
  useUpdatePracticeRegion
} from '@renderer/queries/practice'

// Ghi thay doi vung kieu LAC QUAN: ghi thang vao cache danh sach vung cua file de giao dien
// doi ngay, goi may chu ngam, loi thi hoan lai + bao loi. Dong thoi giu ngan xep hoan tac.

export interface UndoResult {
  /** Vung nen chon/hien lai sau khi hoan tac (null khi vung da bi xoa). */
  regionId: string | null
  pageNumber: number | null
  label: string
}

export interface UpdateOptions {
  /** Ten thao tac (hien o nut Hoan tac). */
  label?: string
  /** Mac dinh true: dua vao ngan xep hoan tac. */
  undoable?: boolean
  /** Ban chup vung TRUOC khi xem truoc (dung khi da goi preview, de hoan tac ve dung gia tri goc). */
  base?: PracticeRegion
}

export interface RegionEditor {
  /** Cap nhat vung; tra true neu thanh cong (hoac khong co gi doi). */
  updateRegion: (region: PracticeRegion, patch: PracticeRegionPatch, options?: UpdateOptions) => Promise<boolean>
  /** Chi ghi vao cache (xem truoc khi keo thanh truot), khong goi may chu, khong vao hoan tac. */
  preview: (regionId: string, patch: PracticeRegionPatch) => void
  deleteRegion: (region: PracticeRegion) => Promise<boolean>
  createRegion: (input: Omit<CreatePracticeRegionInput, 'fileId'>) => Promise<PracticeRegion | null>
  undo: () => Promise<UndoResult | null>
  /** Nhan cua thao tac se hoan tac (null = khong co). */
  undoLabel: string | null
}

export function useRegionEditor(fileId: string, onError: (message: string) => void): RegionEditor {
  const qc = useQueryClient()
  const updateMutation = useUpdatePracticeRegion(fileId)
  const deleteMutation = useDeletePracticeRegion(fileId)
  const restoreMutation = useRestorePracticeRegion(fileId)
  const createMutation = useCreatePracticeRegion(fileId)

  // Giu moi mutation/ham bao loi o ref de cac ham duoi day on dinh (khong doi moi lan render).
  const live = useRef({ updateMutation, deleteMutation, restoreMutation, createMutation, onError })
  live.current = { updateMutation, deleteMutation, restoreMutation, createMutation, onError }

  const stackRef = useRef<EditAction[]>([])
  const [undoLabel, setUndoLabel] = useState<string | null>(null)

  const syncLabel = (): void => {
    const stack = stackRef.current
    setUndoLabel(stack.length > 0 ? stack[stack.length - 1].label : null)
  }

  const cacheKey = practiceKeys.regionsForFile(fileId)
  const getCached = useCallback(
    (id: string): PracticeRegion | undefined => qc.getQueryData<PracticeRegion[]>(cacheKey)?.find((r) => r.id === id),
    [qc, cacheKey]
  )
  const writeOne = useCallback(
    (region: PracticeRegion): void => {
      qc.setQueryData<PracticeRegion[]>(cacheKey, (old) => (old ? old.map((r) => (r.id === region.id ? region : r)) : old))
    },
    [qc, cacheKey]
  )
  const removeOne = useCallback(
    (id: string): void => {
      qc.setQueryData<PracticeRegion[]>(cacheKey, (old) => (old ? old.filter((r) => r.id !== id) : old))
    },
    [qc, cacheKey]
  )
  const reinsert = useCallback(
    (region: PracticeRegion): void => {
      qc.setQueryData<PracticeRegion[]>(cacheKey, (old) =>
        old ? (old.some((r) => r.id === region.id) ? old : [...old, region]) : old
      )
    },
    [qc, cacheKey]
  )

  const preview = useCallback(
    (regionId: string, patch: PracticeRegionPatch): void => {
      const current = getCached(regionId)
      if (current) writeOne(applyPatchToRegion(current, patch))
    },
    [getCached, writeOne]
  )

  const dropAction = (action: EditAction): void => {
    stackRef.current = stackRef.current.filter((a) => a !== action)
    syncLabel()
  }

  const updateRegion = useCallback(
    async (region: PracticeRegion, patch: PracticeRegionPatch, options: UpdateOptions = {}): Promise<boolean> => {
      const before = options.base ?? getCached(region.id) ?? region
      if (!patchChangesRegion(before, patch)) {
        // Neu da xem truoc (cache khac base) nhung ket qua cuoi trung gia tri goc -> tra cache ve goc.
        writeOne(before)
        return true
      }
      const current = getCached(region.id) ?? before
      writeOne(applyPatchToRegion(current, patch))
      let action: EditAction | null = null
      if (options.undoable !== false) {
        action = {
          kind: 'update',
          regionId: region.id,
          inverse: buildInversePatch(before, patch),
          label: options.label ?? 'Sửa vùng'
        }
        stackRef.current = pushUndo(stackRef.current, action)
        syncLabel()
      }
      try {
        await live.current.updateMutation.mutateAsync({ id: region.id, patch })
        return true
      } catch (error) {
        writeOne(before)
        if (action) dropAction(action)
        live.current.onError(errorText(error, 'Không lưu được thay đổi của vùng.'))
        return false
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getCached, writeOne]
  )

  const deleteRegion = useCallback(
    async (region: PracticeRegion): Promise<boolean> => {
      const before = getCached(region.id) ?? region
      removeOne(region.id)
      const action: EditAction = { kind: 'delete', region: before, label: 'Xoá vùng' }
      stackRef.current = pushUndo(stackRef.current, action)
      syncLabel()
      try {
        await live.current.deleteMutation.mutateAsync(region.id)
        return true
      } catch (error) {
        reinsert(before)
        dropAction(action)
        live.current.onError(errorText(error, 'Không xoá được vùng.'))
        return false
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getCached, removeOne, reinsert]
  )

  const createRegion = useCallback(
    async (input: Omit<CreatePracticeRegionInput, 'fileId'>): Promise<PracticeRegion | null> => {
      try {
        const created = await live.current.createMutation.mutateAsync(input)
        stackRef.current = pushUndo(stackRef.current, { kind: 'create', regionId: created.id, label: 'Vẽ vùng mới' })
        syncLabel()
        return created
      } catch (error) {
        live.current.onError(errorText(error, 'Không tạo được vùng mới.'))
        return null
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const undo = useCallback(
    async (): Promise<UndoResult | null> => {
      const popped = popUndo(stackRef.current)
      if (!popped.action) return null
      stackRef.current = popped.stack
      syncLabel()
      const action = popped.action
      try {
        if (action.kind === 'update') {
          const current = getCached(action.regionId)
          if (!current) return null
          writeOne(applyPatchToRegion(current, action.inverse))
          try {
            await live.current.updateMutation.mutateAsync({ id: action.regionId, patch: action.inverse })
          } catch (error) {
            writeOne(current)
            throw error
          }
          return { regionId: action.regionId, pageNumber: current.pageNumber, label: action.label }
        }
        if (action.kind === 'delete') {
          reinsert(action.region)
          try {
            await live.current.restoreMutation.mutateAsync(action.region)
          } catch (error) {
            removeOne(action.region.id)
            throw error
          }
          return { regionId: action.region.id, pageNumber: action.region.pageNumber, label: action.label }
        }
        // create -> xoa vung vua ve
        const created = getCached(action.regionId)
        removeOne(action.regionId)
        try {
          await live.current.deleteMutation.mutateAsync(action.regionId)
        } catch (error) {
          if (created) reinsert(created)
          throw error
        }
        return { regionId: null, pageNumber: created?.pageNumber ?? null, label: action.label }
      } catch (error) {
        live.current.onError(errorText(error, 'Không hoàn tác được.'))
        return null
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getCached, writeOne, removeOne, reinsert]
  )

  return { updateRegion, preview, deleteRegion, createRegion, undo, undoLabel }
}
