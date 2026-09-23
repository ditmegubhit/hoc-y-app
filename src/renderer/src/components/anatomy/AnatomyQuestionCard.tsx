import { usePageImage } from '@renderer/queries/attachmentView'
import type { PlayableAnatomyQuestion, Rect } from '@shared/types/anatomyQuiz'

interface Props {
  attachmentId: string
  question: PlayableAnatomyQuestion
  index: number
  total: number
  value: string
  onChange: (value: string) => void
  onConfirm: () => void
  feedback: { isCorrect: boolean; correctAnswerText: string } | null
  confirmed: boolean
  allowUnconfirm?: boolean
  timedOut?: boolean
}

const sameBox = (a: Rect, b: Rect): boolean =>
  Math.abs(a.x0 - b.x0) < 1 && Math.abs(a.y0 - b.y0) < 1 &&
  Math.abs(a.x1 - b.x1) < 1 && Math.abs(a.y1 - b.y1) < 1

export default function AnatomyQuestionCard(props: Props): React.JSX.Element {
  const { attachmentId, question, index, total, value, onChange, onConfirm,
    feedback, confirmed, allowUnconfirm = false, timedOut = false } = props
  const pageImage = usePageImage(attachmentId, 'page', question.pageNumber, true)
  const crop = question.cropBox ?? { x0: 0, y0: 0, x1: question.refWidth, y1: question.refHeight }
  const width = Math.max(1, crop.x1 - crop.x0)
  const height = Math.max(1, crop.y1 - crop.y0)

  return (
    <div className="anatomy-question-card">
      <p className="anatomy-question-text"><strong>Câu {index + 1}/{total}.</strong> Đây là gì?</p>
      <div className="anatomy-question-image-wrap">
        {pageImage.data ? (
          <svg className="anatomy-station-svg" viewBox={`${crop.x0} ${crop.y0} ${width} ${height}`}>
            <image href={`data:${pageImage.data.mimeType};base64,${pageImage.data.base64}`}
              x="0" y="0" width={question.refWidth} height={question.refHeight}
              preserveAspectRatio="none" />
            {question.maskBoxes.map((box, i) =>
              feedback && sameBox(box, question.targetBox) ? null : (
                <rect key={i} x={box.x0} y={box.y0}
                  width={Math.max(1, box.x1 - box.x0)} height={Math.max(1, box.y1 - box.y0)}
                  className="anatomy-mask-box" />
              ))}
            <rect x={question.targetBox.x0} y={question.targetBox.y0}
              width={Math.max(1, question.targetBox.x1 - question.targetBox.x0)}
              height={Math.max(1, question.targetBox.y1 - question.targetBox.y0)}
              className="anatomy-target-box" />
          </svg>
        ) : <div className="lesson-widget-placeholder">Đang tải ảnh...</div>}
      </div>
      <div className="anatomy-answer-bar">
        <input className={`anatomy-answer-input${feedback ? (feedback.isCorrect ? ' is-correct' : ' is-wrong') : ''}`}
          type="text" placeholder="Gõ tên cấu trúc..." value={value}
          disabled={confirmed || timedOut} autoFocus onChange={(event) => onChange(event.target.value)} />
        <button type="button" className="btn-primary" disabled={timedOut} onClick={onConfirm}>
          {confirmed && allowUnconfirm ? 'Huỷ xác nhận' : 'Xác nhận'}
        </button>
      </div>
      {feedback && (
        <div className={`anatomy-feedback ${feedback.isCorrect ? 'anatomy-feedback--correct' : 'anatomy-feedback--wrong'}`}>
          <p>{feedback.isCorrect ? '✓ Đúng.' : '✗ Sai.'}</p>
          <p>Bạn trả lời: {value || '(để trống)'}</p>
          <p>Đáp án đúng: {feedback.correctAnswerText}</p>
          {timedOut && <p>Bạn ngu vcl</p>}
        </div>
      )}
    </div>
  )
}
