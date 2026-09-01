import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { app } from 'electron'
import * as appSettingsRepo from '../../db/repositories/appSettings.repo'
import type { OllamaStatus } from '../../../shared/types/ai'
import type { ClaudeCliResult } from '../claudeCli/claudeCliClient'

const OLLAMA_HOST = '127.0.0.1'
const OLLAMA_PORT = 11434

// Dung module `http` cua Node (khong dung global fetch) - fetch trong main
// process cua Electron co the bi anh huong boi proxy/undici tuy phien ban, con
// http.request toi 127.0.0.1 thi luon on dinh.
function httpJson(
  path: string,
  method: 'GET' | 'POST',
  body: string | null,
  timeoutMs: number,
  // Neu truyen: goi voi tung chunk text tho (dung cho stream NDJSON). Van resolve
  // voi toan bo text o cuoi.
  onChunk?: (chunk: string) => void
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: OLLAMA_HOST,
        port: OLLAMA_PORT,
        path,
        method,
        headers: body
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          : undefined,
        timeout: timeoutMs
      },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          data += chunk
          onChunk?.(chunk)
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: data }))
      }
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

// Cho phep chi dinh kho model qua env; neu chua co, dung thu muc user da quy uoc
// (khong de tren o C). Phai set TRUOC khi `ollama serve` khoi dong moi co tac dung.
const KNOWN_MODELS_DIR = 'D:\\Game\\Ollama for Coding\\models'

let serverProc: ChildProcess | null = null

function ollamaEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (!env.OLLAMA_MODELS && existsSync(KNOWN_MODELS_DIR)) {
    env.OLLAMA_MODELS = KNOWN_MODELS_DIR
  }
  return env
}

// Do duong dan ollama.exe: cai dat -> thu muc quy uoc -> PATH -> vi tri cai mac dinh.
function resolveOllamaExe(): string | null {
  const configured = appSettingsRepo.getAiSettings().ollamaPath.trim()
  const candidates = [
    configured,
    'D:\\Game\\Ollama for Coding\\app\\ollama.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Ollama', 'ollama.exe'),
    join(process.env.PROGRAMFILES ?? '', 'Ollama', 'ollama.exe')
  ].filter(Boolean) as string[]

  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  // De PATH tu giai quyet (spawn 'ollama')
  return null
}

async function fetchTags(timeoutMs = 5000): Promise<string[] | null> {
  try {
    const res = await httpJson('/api/tags', 'GET', null, timeoutMs)
    if (res.status !== 200) return null
    const data = JSON.parse(res.text) as { models?: { name: string }[] }
    return (data.models ?? []).map((m) => m.name)
  } catch (err) {
    console.error('[ollama] /api/tags fail:', (err as Error).message)
    return null
  }
}

/**
 * Spawn `ollama serve` neu server chua chay. Giu handle de kill luc thoat app.
 * Tra ve true khi server tra loi /api/tags trong thoi gian cho.
 */
export async function ensureOllamaServer(): Promise<boolean> {
  if ((await fetchTags(5000)) !== null) return true

  const exe = resolveOllamaExe()
  console.error('[ollama] server not responding, spawning:', exe ?? 'ollama (PATH)')
  try {
    serverProc = spawn(exe ?? 'ollama', ['serve'], {
      env: ollamaEnv(),
      shell: false,
      detached: false,
      stdio: 'ignore'
    })
    serverProc.on('error', () => {
      serverProc = null
    })
  } catch {
    return false
  }

  // Cho toi 20s cho server len
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    if ((await fetchTags(3000)) !== null) return true
  }
  console.error('[ollama] server did not come up after spawn')
  return false
}

export function stopOllamaServer(): void {
  if (serverProc && !serverProc.killed) {
    serverProc.kill('SIGTERM')
  }
  serverProc = null
}

export async function checkOllama(): Promise<OllamaStatus> {
  let models = await fetchTags()

  if (models === null) {
    const exe = resolveOllamaExe()
    const onPath = exe !== null || (await isOnPath())
    if (!onPath) return { status: 'not_installed' }

    const up = await ensureOllamaServer()
    if (!up) return { status: 'not_running' }
    models = await fetchTags()
    if (models === null) return { status: 'not_running' }
  }

  if (models.length === 0) return { status: 'no_model' }
  return { status: 'ready', models }
}

async function isOnPath(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('ollama', ['--version'], { shell: false, timeout: 4000 })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}

/**
 * Goi Ollama /api/chat voi structured output (format = JSON schema). Tra ve
 * cung hinh dang `ClaudeCliResult` de pipeline sinh cau tai su dung.
 *
 * `onPartial`: neu truyen -> bat che do stream, goi lien tuc voi TOAN BO noi
 * dung JSON da nhan tinh toi luc do (dung de bao tien do "da soan X cau").
 */
export async function runOllamaJson(params: {
  prompt: string
  systemPrompt?: string
  jsonSchema: Record<string, unknown>
  model: string
  timeoutMs?: number
  numCtx?: number
  onPartial?: (fullContentSoFar: string) => void
}): Promise<ClaudeCliResult> {
  const up = await ensureOllamaServer()
  if (!up) {
    return { ok: false, errorMessage: 'Không khởi động được Ollama trên máy.' }
  }

  const messages: { role: string; content: string }[] = []
  if (params.systemPrompt) messages.push({ role: 'system', content: params.systemPrompt })
  messages.push({ role: 'user', content: params.prompt })

  const streaming = typeof params.onPartial === 'function'

  const body = JSON.stringify({
    model: params.model,
    messages,
    format: params.jsonSchema,
    stream: streaming,
    // Giu model nam trong RAM/VRAM 30 phut -> khong nap lai (~15s) khi soan nhieu lan.
    keep_alive: '30m',
    options: {
      temperature: 0.3,
      top_p: 0.9,
      // Giam lap (model hay lap phuong an / lap cau) nhung khong qua manh de tranh
      // hong tieng Viet.
      repeat_penalty: 1.15,
      // num_ctx co dinh (7168) -> Ollama khong nap lai model khi user bat/tat toggle "hoc".
      num_ctx: params.numCtx ?? 7168,
      num_predict: 2048
    }
  })

  // Che do stream: moi dong la 1 JSON {message:{content}, done}. Gom `content`
  // lai, goi onPartial voi phan da co. Giu buffer dong do dang.
  let streamContent = ''
  let lineBuf = ''
  const onChunk = streaming
    ? (chunk: string): void => {
        lineBuf += chunk
        let nl: number
        while ((nl = lineBuf.indexOf('\n')) !== -1) {
          const line = lineBuf.slice(0, nl).trim()
          lineBuf = lineBuf.slice(nl + 1)
          if (!line) continue
          try {
            const obj = JSON.parse(line) as { message?: { content?: string } }
            if (obj.message?.content) {
              streamContent += obj.message.content
              params.onPartial?.(streamContent)
            }
          } catch {
            // dong chua tron ven - hiem khi stream cua Ollama
          }
        }
      }
    : undefined

  try {
    const res = await httpJson(
      '/api/chat',
      'POST',
      body,
      params.timeoutMs ?? 300_000,
      onChunk
    )

    if (res.status !== 200) {
      if (res.status === 404) {
        return {
          ok: false,
          errorMessage: `Ollama chưa có model "${params.model}". Vào Cài đặt để chọn model đã tải, hoặc tải model này.`
        }
      }
      return { ok: false, errorMessage: `Ollama lỗi ${res.status}: ${res.text.slice(0, 300)}` }
    }

    let content: string | undefined
    if (streaming) {
      // flush not do dang (thuong rong o cuoi vi Ollama xuong dong sau moi obj)
      if (lineBuf.trim()) {
        try {
          const obj = JSON.parse(lineBuf.trim()) as { message?: { content?: string } }
          if (obj.message?.content) streamContent += obj.message.content
        } catch {
          // bo qua
        }
      }
      content = streamContent.trim()
    } else {
      const data = JSON.parse(res.text) as { message?: { content?: string } }
      content = data.message?.content?.trim()
    }
    if (!content) {
      return { ok: false, errorMessage: 'Ollama trả về nội dung rỗng.' }
    }

    try {
      return { ok: true, structuredOutput: JSON.parse(content), resultText: content }
    } catch {
      return {
        ok: false,
        errorMessage: `Ollama trả về JSON không hợp lệ: ${content.slice(0, 300)}`
      }
    }
  } catch (err) {
    const msg = (err as Error).message
    console.error('[ollama] /api/chat fail:', msg)
    return {
      ok: false,
      errorMessage:
        msg === 'timeout'
          ? 'Hết thời gian chờ Ollama (model chạy trên máy khá chậm). Thử ít câu hơn một lần.'
          : `Không gọi được Ollama: ${msg}`
    }
  }
}

// ---- Embeddings (cho so trung cau hoi theo ngu nghia) ----

// Ten model chuyen nhung. Neu may co san mot trong so nay -> dung de so trung
// tot hon; khong co thi thoi (so trung van chay bang JS thuan).
const EMBED_MODEL_RE = /embed|minilm|arctic|paraphrase|^bge|gte-|e5-/i

let embedModelCache: { model: string | null; at: number } | null = null

/** Tim model nhung da tai tren may (cache 60s). null neu khong co. */
export async function findEmbeddingModel(): Promise<string | null> {
  if (embedModelCache && Date.now() - embedModelCache.at < 60_000) {
    return embedModelCache.model
  }
  const tags = await fetchTags(4000)
  const model = tags?.find((t) => EMBED_MODEL_RE.test(t)) ?? null
  embedModelCache = { model, at: Date.now() }
  return model
}

/**
 * Nhung 1 lo van ban qua Ollama /api/embed. Tra null neu that bai / khong co
 * model -> ben goi tu dong lui ve so trung bang JS thuan.
 */
export async function embedTexts(
  texts: string[],
  model?: string
): Promise<number[][] | null> {
  if (texts.length === 0) return []
  const embedModel = model ?? (await findEmbeddingModel())
  if (!embedModel) return null

  const up = await ensureOllamaServer()
  if (!up) return null

  try {
    const body = JSON.stringify({ model: embedModel, input: texts, keep_alive: '10m' })
    const res = await httpJson('/api/embed', 'POST', body, 60_000)
    if (res.status !== 200) {
      console.error('[ollama] /api/embed status', res.status)
      return null
    }
    const data = JSON.parse(res.text) as { embeddings?: number[][] }
    if (!data.embeddings || data.embeddings.length !== texts.length) return null
    return data.embeddings
  } catch (err) {
    console.error('[ollama] /api/embed fail:', (err as Error).message)
    return null
  }
}

app.on('before-quit', stopOllamaServer)
