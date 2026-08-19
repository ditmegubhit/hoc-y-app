import { createWorker, type Worker } from 'tesseract.js'
import { tessdataDir } from './resourcePaths'

// Worker duoc tao 1 lan va tai su dung suot vong doi process main - createWorker
// load wasm core + traineddata (vie+eng) ton vai tram ms den vai giay, tao lai
// moi trang/file se rat cham khi OCR ca file PDF nhieu trang.
let workerPromise: Promise<Worker> | null = null

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(['vie', 'eng'], undefined, {
      langPath: tessdataDir(),
      gzip: false,
      logger: () => {}
    })
  }
  return workerPromise
}

export async function recognizeImage(input: Buffer): Promise<string> {
  const worker = await getWorker()
  const { data } = await worker.recognize(input)
  return data.text
}

export interface OcrWord {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

export interface OcrResult {
  text: string
  words: OcrWord[]
}

// Dung khi can toa do tung tu (de sau nay ve khung to mau) - mac dinh
// worker.recognize() KHONG tra blocks (defaultOutput.js: blocks:false), phai
// truyen output rieng moi co du lieu nay.
export async function recognizeImageWithWords(input: Buffer): Promise<OcrResult> {
  const worker = await getWorker()
  const { data } = await worker.recognize(input, {}, { text: true, blocks: true })
  const words: OcrWord[] = []
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          words.push({
            text: word.text,
            bbox: { x0: word.bbox.x0, y0: word.bbox.y0, x1: word.bbox.x1, y1: word.bbox.y1 }
          })
        }
      }
    }
  }
  return { text: data.text, words }
}

export async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return
  const worker = await workerPromise
  workerPromise = null
  await worker.terminate()
}
