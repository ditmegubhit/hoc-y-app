import { useCallback, useEffect, useRef, useState } from 'react'
import type { PracticeRegion } from '@shared/types/practice'
import { formatAlternates, initialAnswerOf, isAnswerFormDirty } from '@shared/practice/editLogic'

// Trang thai o "Dap an" + "Dap an khac" cua vung dang xet. Chi nap lai gia tri khi doi vung
// hoac khi nonce tang (hoan tac / nhan de xuat) - KHONG nap lai moi khi du lieu vung doi
// (vd luu vi tri o che), de khong mat chu dang go do.

export interface AnswerForm {
  answer: string
  alternates: string
  setAnswer: (value: string) => void
  setAlternates: (value: string) => void
  dirty: boolean
  answerRef: React.RefObject<HTMLInputElement | null>
  /** Dua con tro ve o dap an. selectAll (mac dinh true) chon het chu; false giu nguyen vi tri con tro. */
  focusAnswer: (selectAll?: boolean) => void
}

interface FormState {
  key: string
  answer: string
  alternates: string
}

function stateFor(key: string, region: PracticeRegion | null): FormState {
  return {
    key,
    answer: region ? initialAnswerOf(region) : '',
    alternates: region ? formatAlternates(region.alternates) : ''
  }
}

export function useAnswerForm(region: PracticeRegion | null, nonce: number): AnswerForm {
  const key = region ? `${region.id}:${nonce}` : ''
  const [stored, setStored] = useState<FormState>(() => stateFor(key, region))
  // Doi vung: nap lai ngay trong luc render (khong qua 1 khung hinh cu).
  const form = stored.key === key ? stored : stateFor(key, region)
  if (stored.key !== key) setStored(form)

  const answerRef = useRef<HTMLInputElement | null>(null)

  const setAnswer = useCallback((value: string) => setStored((s) => ({ ...s, key, answer: value })), [key])
  const setAlternates = useCallback((value: string) => setStored((s) => ({ ...s, key, alternates: value })), [key])

  const focusAnswer = useCallback((selectAll: boolean = true): void => {
    const input = answerRef.current
    if (!input) return
    input.focus()
    if (selectAll) input.select()
  }, [])

  // Tu focus khi chon vung moi / hoan tac.
  useEffect(() => {
    if (key === '') return
    const id = window.setTimeout(() => focusAnswer(true), 0)
    return () => window.clearTimeout(id)
  }, [key, focusAnswer])

  const dirty = region ? isAnswerFormDirty(region, form.answer, form.alternates) : false
  return { answer: form.answer, alternates: form.alternates, setAnswer, setAlternates, dirty, answerRef, focusAnswer }
}
