import { runClaudeHeadless, type ClaudeCliResult } from '../claudeCli/claudeCliClient'
import { runOllamaJson, embedTexts, findEmbeddingModel } from '../ollama/ollamaClient'
import * as appSettingsRepo from '../../db/repositories/appSettings.repo'
import type { AiProvider } from '../../../shared/types/ai'
import type { Embedder } from '../quiz/semanticDedup'

export interface RunAiJsonParams {
  provider: AiProvider
  // Prompt chinh (noi dung nguon + yeu cau). Voi Claude, checklist nam luon trong
  // day; voi Ollama, phan huong dan/tieu chi nen tach ra `systemPrompt`.
  prompt: string
  systemPrompt?: string
  jsonSchema: Record<string, unknown>
  timeoutMs?: number
  // Model Ollama; rong = lay tu cai dat.
  model?: string
  // num_ctx cho Ollama (bo qua voi Claude).
  numCtx?: number
  // Bao tien do khi Ollama stream (bo qua voi Claude - CLI khong stream JSON).
  onPartial?: (fullContentSoFar: string) => void
}

/**
 * Diem vao chung cho moi loi goi AI sinh JSON. Dieu phoi giua Claude Code CLI
 * (ton token goi Pro) va Ollama (offline, cham hon).
 */
export async function runAiJson(params: RunAiJsonParams): Promise<ClaudeCliResult> {
  if (params.provider === 'ollama') {
    const model = params.model || appSettingsRepo.getAiSettings().ollamaModel
    return runOllamaJson({
      prompt: params.prompt,
      systemPrompt: params.systemPrompt,
      jsonSchema: params.jsonSchema,
      model,
      timeoutMs: params.timeoutMs,
      numCtx: params.numCtx,
      onPartial: params.onPartial
    })
  }

  // Claude: gop system + prompt lam mot (CLI headless chi nhan 1 prompt).
  const merged = params.systemPrompt
    ? `${params.systemPrompt}\n\n${params.prompt}`
    : params.prompt
  return runClaudeHeadless({
    prompt: merged,
    jsonSchema: params.jsonSchema,
    timeoutMs: params.timeoutMs
  })
}

export function shouldAutoRefine(provider: AiProvider): boolean {
  if (provider === 'claude') return true
  return appSettingsRepo.getAiSettings().ollamaAutoRefine
}

// Che do "hoc" cua Ollama: co dua cau mau tu ngan hang vao prompt khong.
// Keo theo num_ctx + ngan sach nguon lon hon (cham hon).
export interface OllamaGenTuning {
  learn: boolean
  numCtx: number
  maxContentChars: number
}

/**
 * Ham nhung dua tren model nhung da tai san tren may (neu co). Dung cho so trung
 * cau hoi theo ngu nghia. undefined -> so trung chi bang JS thuan.
 */
export async function maybeOllamaEmbedder(): Promise<Embedder | undefined> {
  const model = await findEmbeddingModel()
  if (!model) return undefined
  return (texts: string[]) => embedTexts(texts, model)
}

export function ollamaGenTuning(): OllamaGenTuning {
  const learn = appSettingsRepo.getAiSettings().ollamaUseLearnedExamples
  // Prompt eval tren iGPU rat cham va tang bac hai theo do dai -> giu prompt nho.
  // num_ctx co dinh 6144 cho ca 2 che do -> khong nap lai model khi bat/tat toggle;
  // du cho ~4k token prompt + ~2k token sinh. Nguon cat con 7k ky tu (7B khong
  // dung het nguon dai hon).
  return { learn, numCtx: 7168, maxContentChars: 7_000 }
}
