import { app } from 'electron'
import { basename, join } from 'node:path'
import type { VietOcrPaths } from './vietocrOnnx'

// Thu muc model VietOCR (ONNX): extraResources -> <resources>/vietocr khi dong goi,
// con luc dev/bench thi la <project>/resources/vietocr (giong cach tessdataDir tinh).
export function vietOcrDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'vietocr')
    : join(__dirname, basename(__dirname) === 'chunks' ? '../../../resources/vietocr' : '../../resources/vietocr')
}

export function vietOcrPaths(dir: string = vietOcrDir()): VietOcrPaths {
  return { encoder: join(dir, 'encoder_fp16.onnx'), decoder: join(dir, 'decoder_fp16.onnx'), vocab: join(dir, 'vocab.txt') }
}
