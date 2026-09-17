import { useEffect, useRef, useState } from 'react'
import { usePageImage } from '@renderer/queries/attachmentView'
import type { PlayableAnatomyQuestion } from '@shared/types/anatomyQuiz'

interface AnatomyQuestionCardProps {
  attachmentId: string
  question: PlayableAnatomyQuestion
  index: number
  total: number
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  feedback: { isCorrect: boolean; correctAnswerText: string } | null
  disabled: boolean
}

function AnatomyQuestionCard({
  attachmentId,
  question,
  index,
  total,
  value,
  onChange,
  onSubmit,
  feedback,
  disabled
}: AnatomyQuestionCardProps): React.JSX.Element {
  const pageImage = usePageImage(attachmentId, 'page', question.pageNumber, true)
  const imgRef = useRef<HTMLImageElement>(null)
  const [displayedWidth, setDisplayedWidth] = useState(0)

  useEffect(() => {
    const el = imgRef.current
    if (!el) return
    const update = (): void => setDisplayedWidth(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [pageImage.data])

  const scale = displayedWidth > 0 ? displayedWidth / question.refWidth : 0
  const t = question.targetBox

  return (
    <div className="anatomy-question-card">
      <p className="anatomy-question-text">
        <strong>
          Câu {index + 1}/{total}.
        </strong>{' '}
        Ô viền đỏ đang che cấu trúc nào?
      </p>

      <div className="anatomy-question-image-wrap">
        {pageImage.data ? (
          <>
            <img
              ref={imgRef}
              className="anatomy-question-image"
              src={`data:${pageImage.data.mimeType};base64,${pageImage.data.base64}`}
              alt={`Trang ${question.pageNumber}`}
            />
            {scale > 0 && (
              <svg
                className="anatomy-question-overlay"
                width={displayedWidth}
                height={displayedWidth * (question.refHeight / question.refWidth)}
              >
                {question.maskBoxes.map((box, i) => (
                  <rect
                    key={i}
                    x={box.x0 * scale}
                    y={box.y0 * scale}
                    width={(box.x1 - box.x0) * scale}
                    height={(box.y1 - box.y0) * scale}
                    className="anatomy-mask-box"
                  />
                ))}
                <rect
                  x={t.x0 * scale}
                  y={t.y0 * scale}
                  width={(t.x1 - t.x0) * scale}
                  height={(t.y1 - t.y0) * scale}
                  className="anatomy-target-box"
                />
              </svg>
            )}
          </>
        ) : (
          <div className="lesson-widget-placeholder">Đang tải ảnh...</div>
        )}
      </div>

      <div className="anatomy-answer-bar">
        <input
          type="text"
          className="anatomy-answer-input"
          placeholder="Gõ tên cấu trúc..."
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !disabled) onSubmit()
          }}
        />
        <button type="button" className="btn-primary" disabled={disabled} onClick={onSubmit}>
          Trả lời
        </button>
      </div>

      {feedback && (
        <p className={`anatomy-feedback ${feedback.isCorrect ? 'anatomy-feedback--correct' : 'anatomy-feedback--wrong'}`}>
          {feedback.isCorrect ? '✓ Đúng rồi.' : `✗ Sai. Đáp án đúng: ${feedback.correctAnswerText}`}
        </p>
      )}
    </div>
  )
}

export default AnatomyQuestionCard
