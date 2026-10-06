import {
  ArrowLeft,
  ArrowRight,
  Check,
  EyeOff,
  Loader2,
  ScanText,
  Sparkles,
  Trash2,
  Undo2
} from 'lucide-react'
import type { PracticeRegion, PracticeTextReading } from '@shared/types/practice'
import { isConfirmableAnswer, regionVisualState, suspectReasonText } from '@shared/practice/editLogic'
import type { AnswerForm } from './useAnswerForm'
import type { EditMode } from './editTypes'

// Hop "Dap an": o dap an + dap an khac + nut xac nhan / chi che / bo qua / lui / xoa / hoan tac
// + de xuat cua Claude (chi de nghi, nguoi dung tu nhan hay bo).

interface AnswerPanelProps {
  mode: EditMode
  region: PracticeRegion | null
  form: AnswerForm
  /** Vi du "Vùng 12 / 340" (trinh tu) hoac "3 vùng trên trang" (chon vung). */
  positionText: string | null
  emptyHint: React.ReactNode
  canPrev: boolean
  onConfirm: () => void
  onMaskOnly: () => void
  onNext: () => void
  onPrev: () => void
  onDeselect: () => void
  onDelete: () => void
  onUndo: () => void
  undoLabel: string | null
  onReadAi: () => void
  onReadPageAi: () => void
  aiBusy: boolean
  aiPageBusy: boolean
  suggestion: PracticeTextReading | null
  onAcceptSuggestion: () => void
  onRejectSuggestion: () => void
}

const STATE_LABEL = { unreviewed: 'Chưa duyệt', confirmed: 'Đã xác nhận', maskOnly: 'Chỉ che' } as const
const CERTAINTY_LABEL = { clear: 'chắc chắn', uncertain: 'không chắc', unreadable: 'không đọc được' } as const

export default function AnswerPanel(props: AnswerPanelProps): React.JSX.Element {
  const { mode, region, form, positionText, emptyHint, canPrev, suggestion } = props
  const sequence = mode === 'sequence'

  if (!region) {
    return (
      <section className="pe-card pe-answer-card" aria-label="Đáp án">
        <h3 className="pe-card-title">Đáp án</h3>
        <div className="pe-empty-hint">{emptyHint}</div>
        <div className="pe-actions">
          <button type="button" className="pe-btn" onClick={props.onReadPageAi} disabled={props.aiPageBusy}>
            {props.aiPageBusy ? <Loader2 size={13} className="practice-spin" /> : <ScanText size={13} />} Claude đọc cả trang
          </button>
          <button type="button" className="pe-btn" onClick={props.onUndo} disabled={!props.undoLabel} title={props.undoLabel ? `Hoàn tác: ${props.undoLabel} (Ctrl+Z)` : 'Chưa có gì để hoàn tác'}>
            <Undo2 size={13} /> Hoàn tác
          </button>
        </div>
      </section>
    )
  }

  const state = regionVisualState(region)
  const canConfirm = isConfirmableAnswer(form.answer)
  const showRaw = region.rawText.trim() !== '' && region.rawText.trim() !== form.answer.trim()

  return (
    <section className="pe-card pe-answer-card" aria-label="Đáp án">
      <div className="pe-answer-head">
        <h3 className="pe-card-title">Đáp án</h3>
        {positionText && <span className="pe-position">{positionText}</span>}
        <span className={`pe-state is-${state}`}>{STATE_LABEL[state]}</span>
        {region.manual && <span className="pe-state is-manual">Tự vẽ</span>}
        {region.suspect && (
          <span className="pe-state is-suspect" title="Vùng này có thể là rác (tiêu đề, chú thích, logo...). Không tự xoá, bạn quyết định.">
            Nghi rác: {suspectReasonText(region)}
          </span>
        )}
      </div>

      <div className="pe-answer-fields">
        <label className="pe-field">
          <span className="pe-field-label">Đáp án</span>
          <input
            ref={form.answerRef}
            data-pe-answer=""
            type="text"
            className={`pe-input${!canConfirm ? ' is-empty' : ''}`}
            autoComplete="off"
            spellCheck={false}
            placeholder="Gõ tên cấu trúc…"
            value={form.answer}
            onChange={(e) => form.setAnswer(e.target.value)}
          />
        </label>
        <label className="pe-field">
          <span className="pe-field-label">Đáp án khác (ngăn bằng dấu ;)</span>
          <input
            data-pe-answer=""
            type="text"
            className="pe-input"
            autoComplete="off"
            spellCheck={false}
            placeholder="vd: niệu quản; ống dẫn niệu"
            value={form.alternates}
            onChange={(e) => form.setAlternates(e.target.value)}
          />
        </label>
      </div>

      {(showRaw || suggestion) && (
        <div className="pe-hints">
          {showRaw && (
            <span className="pe-hint">
              Chữ nhận dạng: <q>{region.rawText}</q>{' '}
              <button type="button" className="pe-link" onClick={() => form.setAnswer(region.rawText)}>
                dùng chữ này
              </button>
            </span>
          )}
          {suggestion && (
            <span className="pe-hint is-ai">
              <Sparkles size={12} aria-hidden="true" /> Claude đọc:{' '}
              <q>{suggestion.text || '(trống)'}</q> ({CERTAINTY_LABEL[suggestion.certainty]}){' '}
              {suggestion.text.trim() !== '' && (
                <button type="button" className="pe-link" onClick={props.onAcceptSuggestion}>
                  nhận
                </button>
              )}{' '}
              <button type="button" className="pe-link" onClick={props.onRejectSuggestion}>
                bỏ
              </button>
            </span>
          )}
        </div>
      )}
      {!canConfirm && (
        <p className="pe-warn">
          Đáp án đang trống - gõ đáp án, hoặc dùng &quot;Chỉ che&quot; nếu vùng này chỉ cần che mà không hỏi.
        </p>
      )}

      <div className="pe-actions">
        {sequence && (
          <button type="button" className="pe-btn" disabled={!canPrev} onClick={props.onPrev} title="Vùng trước, không lưu (←)">
            <ArrowLeft size={13} /> Lùi
          </button>
        )}
        <button
          type="button"
          className="pe-btn is-primary"
          disabled={!canConfirm}
          onClick={props.onConfirm}
          title={sequence ? 'Lưu đáp án và sang vùng kế (Enter)' : 'Lưu đáp án và bỏ chọn vùng (Enter)'}
        >
          <Check size={13} /> Xác nhận <kbd>Enter</kbd>
        </button>
        <button type="button" className="pe-btn" onClick={props.onMaskOnly} title="Chỉ che, không đặt câu hỏi cho vùng này (đánh dấu đã duyệt)">
          <EyeOff size={13} /> Chỉ che (không hỏi)
        </button>
        {sequence ? (
          <button type="button" className="pe-btn" onClick={props.onNext} title="Sang vùng kế, không lưu (→)">
            Bỏ qua <ArrowRight size={13} />
          </button>
        ) : (
          <button type="button" className="pe-btn" onClick={props.onDeselect} title="Bỏ chọn, không lưu (Esc)">
            Bỏ chọn <kbd>Esc</kbd>
          </button>
        )}
        <span className="pe-actions-gap" />
        <button type="button" className="pe-btn is-danger" onClick={props.onDelete} title="Xoá vùng này (Delete; trong ô nhập: Ctrl+Delete)">
          <Trash2 size={13} /> Xoá vùng
        </button>
        <button type="button" className="pe-btn" onClick={props.onUndo} disabled={!props.undoLabel} title={props.undoLabel ? `Hoàn tác: ${props.undoLabel} (Ctrl+Z)` : 'Chưa có gì để hoàn tác'}>
          <Undo2 size={13} /> Hoàn tác
        </button>
        <button type="button" className="pe-btn" onClick={props.onReadAi} disabled={props.aiBusy} title="Nhờ Claude đọc lại chữ của vùng này (chỉ đề xuất, bạn quyết định nhận hay bỏ)">
          {props.aiBusy ? <Loader2 size={13} className="practice-spin" /> : <Sparkles size={13} />} Nhờ Claude đọc lại
        </button>
        <button type="button" className="pe-btn" onClick={props.onReadPageAi} disabled={props.aiPageBusy} title="Nhờ Claude đọc cả trang này (chỉ đề xuất)">
          {props.aiPageBusy ? <Loader2 size={13} className="practice-spin" /> : <ScanText size={13} />} Đọc cả trang
        </button>
      </div>
    </section>
  )
}
