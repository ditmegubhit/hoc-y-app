import { readFileSync } from 'node:fs'
import { createCanvas, type Canvas } from '@napi-rs/canvas'

// VietOCR (pbcquoc/vietocr, MIT) cau hinh vgg_transformer, ban ONNX tach encoder/decoder.
// Nhan dang MOT DONG chu tieng Viet (co dau, ke ca chu HOA). Chay bang onnxruntime-node (CPU).
//  - Anh vao: cao 32 px, rong = ceil(32*w/h /10)*10 trong [32, maxWidth], RGB, chia 255 (khong tru trung binh).
//  - Giai ma tham lam: bat dau <sos>=1, dung khi <eos>=2; id chu = vi tri trong vocab (4 ky tu dac biet dau tien).

export interface VietOcrPaths { encoder: string; decoder: string; vocab: string }

export interface LineReading {
  text: string
  /** Trung binh hinh hoc xac suat tung ky tu (0..1). */
  confidence: number
  /** Xac suat thap nhat cua 1 ky tu (0..1) - phat hien ky tu doan bua. */
  minCharConfidence: number
}

type Ort = typeof import('onnxruntime-node')
type OrtSession = import('onnxruntime-node').InferenceSession

const SOS = 1
const EOS = 2
const IMAGE_HEIGHT = 32
const MIN_WIDTH = 32
const MAX_STEPS = 128

/** Rong dau vao theo quy tac VietOCR (lam tron len boi cua 10). */
export function vietOcrInputWidth(width: number, height: number, maxWidth = 512): number {
  const raw = Math.floor((IMAGE_HEIGHT * width) / Math.max(1, height))
  const rounded = Math.ceil(raw / 10) * 10
  return Math.min(maxWidth, Math.max(MIN_WIDTH, rounded))
}

export function parseVocab(content: string): string[] {
  // 1 dong = 1 token; 4 dong dau la <pad>,<sos>,<eos>,<mask>. Giu nguyen dong trong (ky tu cach).
  const lines = content.replace(/\r/g, '').split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

export class VietOcrEngine {
  private constructor(
    private readonly ort: Ort,
    private readonly encoder: OrtSession,
    private readonly decoder: OrtSession,
    private readonly vocab: string[],
    private readonly maxWidth: number
  ) {}

  static async load(paths: VietOcrPaths, options: { threads?: number; maxWidth?: number } = {}): Promise<VietOcrEngine> {
    const ort = await import('onnxruntime-node')
    const sessionOptions = {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all' as const,
      intraOpNumThreads: options.threads ?? 4,
      logSeverityLevel: 3 as const
    }
    const [encoder, decoder] = await Promise.all([
      ort.InferenceSession.create(paths.encoder, sessionOptions),
      ort.InferenceSession.create(paths.decoder, sessionOptions)
    ])
    const vocab = parseVocab(readFileSync(paths.vocab, 'utf8'))
    return new VietOcrEngine(ort, encoder, decoder, vocab, options.maxWidth ?? 512)
  }

  private toTensor(canvas: Canvas): { data: Float32Array; width: number } {
    const width = vietOcrInputWidth(canvas.width, canvas.height, this.maxWidth)
    const resized = createCanvas(width, IMAGE_HEIGHT)
    const ctx = resized.getContext('2d')
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, IMAGE_HEIGHT)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, width, IMAGE_HEIGHT)
    const rgba = ctx.getImageData(0, 0, width, IMAGE_HEIGHT).data
    const plane = width * IMAGE_HEIGHT
    const data = new Float32Array(3 * plane)
    for (let i = 0; i < plane; i++) {
      data[i] = rgba[i * 4] / 255
      data[plane + i] = rgba[i * 4 + 1] / 255
      data[2 * plane + i] = rgba[i * 4 + 2] / 255
    }
    return { data, width }
  }

  /** Doc 1 dong chu tu canvas (anh nen sang, chu toi la tot nhat). */
  async recognize(canvas: Canvas): Promise<LineReading> {
    const { ort } = this
    const { data, width } = this.toTensor(canvas)
    const encInputName = this.encoder.inputNames[0]
    const encoded = await this.encoder.run({ [encInputName]: new ort.Tensor('float32', data, [1, 3, IMAGE_HEIGHT, width]) })
    const memory = encoded[this.encoder.outputNames[0]]
    const tokens: number[] = [SOS]
    const probs: number[] = []
    const [tgtName, memName] = this.decoder.inputNames
    for (let step = 0; step < MAX_STEPS; step++) {
      const tgt = new ort.Tensor('int64', BigInt64Array.from(tokens.map((t) => BigInt(t))), [tokens.length, 1])
      const out = await this.decoder.run({ [tgtName]: tgt, [memName]: memory })
      const logits = out[this.decoder.outputNames[0]]
      const dims = logits.dims
      const vocabSize = dims[dims.length - 1]
      const all = logits.data as Float32Array
      const offset = all.length - vocabSize // vi tri cuoi (ca 2 dinh dang dau ra)
      let best = 0; let max = -Infinity
      for (let i = 0; i < vocabSize; i++) if (all[offset + i] > max) { max = all[offset + i]; best = i }
      let sum = 0
      for (let i = 0; i < vocabSize; i++) sum += Math.exp(all[offset + i] - max)
      const prob = 1 / sum
      if (best === EOS || best === 0) break
      tokens.push(best)
      if (best >= 4) probs.push(prob)
    }
    let text = ''
    for (const id of tokens.slice(1)) if (id >= 4 && id < this.vocab.length) text += this.vocab[id]
    const logSum = probs.reduce((acc, p) => acc + Math.log(Math.max(1e-9, p)), 0)
    return {
      text: text.normalize('NFC').trim(),
      confidence: probs.length ? Math.exp(logSum / probs.length) : 0,
      minCharConfidence: probs.length ? Math.min(...probs) : 0
    }
  }

  async dispose(): Promise<void> {
    await Promise.allSettled([this.encoder.release(), this.decoder.release()])
  }
}
