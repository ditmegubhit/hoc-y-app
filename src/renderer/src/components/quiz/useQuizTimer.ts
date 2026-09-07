import { useEffect, useRef, useState } from 'react'

interface UseQuizTimerOpts {
  running: boolean
  // null -> dem xuoi (khong gioi han). So giay -> dem nguoc.
  limitSeconds: number | null
  // Goi DUNG MOT LAN khi dem nguoc ve 0.
  onExpire?: () => void
}

interface QuizTimerState {
  elapsedSeconds: number
  remainingSeconds: number | null
}

/**
 * Dong ho lam bai. `elapsed` suy tu timestamp bat dau (khong cong don moi tick)
 * nen khong bi troi khi tab ngu/lag. Tinh lai khi cua so `focus` (laptop ngu).
 */
export function useQuizTimer(opts: UseQuizTimerOpts): QuizTimerState {
  const { running, limitSeconds, onExpire } = opts
  const startRef = useRef<number | null>(null)
  const firedRef = useRef(false)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (!running) {
      startRef.current = null
      firedRef.current = false
      setElapsedSeconds(0)
      return
    }

    startRef.current = Date.now()
    firedRef.current = false

    const tick = (): void => {
      if (startRef.current == null) return
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000)
      setElapsedSeconds(elapsed)
      if (
        limitSeconds != null &&
        elapsed >= limitSeconds &&
        !firedRef.current
      ) {
        firedRef.current = true
        onExpireRef.current?.()
      }
    }

    tick()
    const id = window.setInterval(tick, 1000)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', tick)
    }
  }, [running, limitSeconds])

  const remainingSeconds =
    limitSeconds == null ? null : Math.max(0, limitSeconds - elapsedSeconds)

  return { elapsedSeconds, remainingSeconds }
}
