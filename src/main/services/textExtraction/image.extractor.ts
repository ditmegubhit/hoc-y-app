import { readFile } from 'node:fs/promises'
import { loadImage } from '@napi-rs/canvas'
import { recognizeImageWithWords } from '../ocr/ocrEngine'
import { ocrLimiter } from '../ocr/limiter'
import type { ExtractedChunk } from './index'

export async function extractImageText(
  filePath: string,
  onOcrStart?: () => void
): Promise<ExtractedChunk[]> {
  onOcrStart?.()
  const buffer = await readFile(filePath)
  const img = await loadImage(buffer)
  const { text, words } = await ocrLimiter(() => recognizeImageWithWords(buffer))
  return [
    {
      unitType: 'image',
      unitIndex: 1,
      text,
      words,
      coordSpace: 'image_pixel',
      refWidth: img.width,
      refHeight: img.height
    }
  ]
}
