import { Palette, RotateCcw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { PracticeFile } from '@shared/types/practice'
import { errorText } from '@shared/practice/quizLogic'
import { practiceKeys, useUpdatePracticeFileSettings } from '@renderer/queries/practice'
import ColorPicker from './ColorPicker'
import OpacitySlider from './OpacitySlider'

// Hop rieng "Mau che ca file": bang mau hinh tron + do mo chung (chi anh huong luc sua) +
// nut "Dat lai mau rieng". Doi mau/do mo -> cap nhat cache file ngay (cac vung khong co mau
// rieng doi theo), chi goi may chu khi tha.

interface FileColorPanelProps {
  file: PracticeFile
  recent: readonly string[]
  /** So vung dang co mau hoac do mo rieng. */
  overrideCount: number
  onPushRecent: (hex: string) => void
  onRequestReset: () => void
  onError: (message: string) => void
}

export default function FileColorPanel({
  file,
  recent,
  overrideCount,
  onPushRecent,
  onRequestReset,
  onError
}: FileColorPanelProps): React.JSX.Element {
  const qc = useQueryClient()
  const update = useUpdatePracticeFileSettings()
  const fileKey = practiceKeys.file(file.id)

  const previewFile = (patch: Partial<Pick<PracticeFile, 'maskColor' | 'maskOpacity'>>): void => {
    qc.setQueryData<PracticeFile>(fileKey, (old) => (old ? { ...old, ...patch } : old))
  }
  const revert = (error: unknown): void => {
    void qc.invalidateQueries({ queryKey: fileKey })
    onError(errorText(error, 'Không lưu được màu che của file.'))
  }

  return (
    <section className="pe-card pe-color-card" aria-label="Màu che cả file">
      <h3 className="pe-card-title">
        <Palette size={13} aria-hidden="true" /> Màu che cả file
      </h3>
      <ColorPicker
        idPrefix="pe-file"
        value={file.maskColor}
        recent={recent}
        onChange={(hex) => previewFile({ maskColor: hex })}
        onCommit={(hex) => {
          onPushRecent(hex)
          update.mutate({ fileId: file.id, maskColor: hex }, { onError: revert })
        }}
      >
        <OpacitySlider
          id="pe-file-opacity"
          label="Độ mờ"
          value={file.maskOpacity}
          title="Độ mờ chung: chỉ áp dụng khi đang sửa (để thấy chữ bên dưới). Bài thi luôn che đục 100%."
          onPreview={(maskOpacity) => previewFile({ maskOpacity })}
          onCommit={(maskOpacity) => update.mutate({ fileId: file.id, maskOpacity }, { onError: revert })}
        />
        <button
          type="button"
          className="pe-btn is-small"
          disabled={overrideCount === 0}
          title={
            overrideCount === 0
              ? 'Chưa có vùng nào đặt màu hoặc độ mờ riêng.'
              : `Xoá màu và độ mờ riêng của ${overrideCount} vùng, về dùng màu chung`
          }
          onClick={onRequestReset}
        >
          <RotateCcw size={12} aria-hidden="true" /> Đặt lại màu riêng{overrideCount > 0 ? ` (${overrideCount})` : ''}
        </button>
      </ColorPicker>
    </section>
  )
}
