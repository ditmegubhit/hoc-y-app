import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { app } from 'electron'
import { join } from 'node:path'

// PaddleOCR-json (https://github.com/hiroi-sora/PaddleOCR-json) - engine OCR
// dua tren deep learning (khong phai Tesseract), dang THU NGHIEM rieng cho
// tinh nang anatomy vi phat hien duong bao (det model) gom duoc CA CUM/DONG
// chu thanh 1 o hoan chinh tot hon nhieu so voi Tesseract tren anh chup chu
// viet tay lon. KHONG dung engine nay cho pipeline OCR chung (search toan
// van) - van giu Tesseract o do, tranh doi hanh vi anh huong tinh nang khac.
//
// Luu y quan trong: ban rec (nhan dien NOI DUNG chu) mac dinh cua engine nay
// KHONG co model tieng Viet rieng, dict co san (Trung/Anh/Nhat/Han/Latin) deu
// thieu dau tieng Viet -> chu 'text' tra ve chi la GOI Y THO (thuong mat dau
// hoac sai), khong duoc coi la dap an dung. Gia tri chinh cua engine nay o
// day la VI TRI/O CHU (box) chinh xac hon, con doc dung noi dung van can
// nguoi soan (hoac Claude xem anh truc tiep) xac nhan lai.
function paddleOcrDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'paddleocr')
    : join(__dirname, '../../resources/paddleocr/PaddleOCR-json_v1.4.1')
}

export interface PaddleOcrLine {
  text: string
  box: { x0: number; y0: number; x1: number; y1: number }
  score: number
}

interface PendingRequest {
  resolve: (lines: PaddleOcrLine[]) => void
  reject: (err: Error) => void
}

let proc: ChildProcessWithoutNullStreams | null = null
let initPromise: Promise<void> | null = null
let stdoutBuffer = ''
const queue: PendingRequest[] = []

function quadToRect(box: [number, number][]): { x0: number; y0: number; x1: number; y1: number } {
  const xs = box.map((p) => p[0])
  const ys = box.map((p) => p[1])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

// Engine chay nhu 1 tien trinh con SONG - giu song suot doi song app (khoi
// tao model ton ~1-2s, khong the lam lai cho moi anh) - giao thuc: sau khi in
// dong "OCR init completed.", moi lan nhan 1 dong JSON qua stdin thi tra ve
// dung 1 dong JSON ket qua qua stdout.
function ensureProcess(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = new Promise((resolve, reject) => {
    const exeDir = paddleOcrDir()
    const child = spawn(join(exeDir, 'PaddleOCR-json.exe'), [], {
      cwd: exeDir,
      windowsHide: true
    })
    proc = child

    let initBuffer = ''
    let initDone = false

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      if (!initDone) {
        initBuffer += text
        if (initBuffer.includes('OCR init completed.')) {
          initDone = true
          resolve()
        }
        return
      }

      stdoutBuffer += text
      if (!stdoutBuffer.endsWith('\n')) return
      const line = stdoutBuffer
      stdoutBuffer = ''

      const pending = queue.shift()
      if (!pending) return
      try {
        const parsed = JSON.parse(line) as { code: number; data: unknown }
        if (parsed.code === 100 && Array.isArray(parsed.data)) {
          const lines = (
            parsed.data as { box: [number, number][]; text: string; score: number }[]
          ).map((d) => ({ text: d.text, box: quadToRect(d.box), score: d.score }))
          pending.resolve(lines)
        } else {
          pending.resolve([])
        }
      } catch (err) {
        pending.reject(err instanceof Error ? err : new Error(String(err)))
      }
    })

    child.on('error', (err) => {
      initPromise = null
      proc = null
      reject(err)
    })
    child.once('exit', () => {
      proc = null
      initPromise = null
      for (const p of queue.splice(0)) p.reject(new Error('PaddleOCR-json da dong.'))
    })
  })

  return initPromise
}

export async function recognizeImageLines(pngBuffer: Buffer): Promise<PaddleOcrLine[]> {
  await ensureProcess()
  if (!proc) throw new Error('PaddleOCR-json chua san sang.')

  return new Promise((resolve, reject) => {
    queue.push({ resolve, reject })
    proc!.stdin.write(JSON.stringify({ image_base64: pngBuffer.toString('base64') }) + '\n')
  })
}

export function terminatePaddleOcr(): void {
  if (proc) proc.kill()
  proc = null
  initPromise = null
}
