// AI tao cau hoi co 2 engine: Claude Code CLI (nhu cu, ton token goi Pro) va
// Ollama (model chay tren may, offline, khong ton token). Nut rieng cho tung
// cai - khong phai toggle.

export type AiProvider = 'claude' | 'ollama'

export type OllamaStatus =
  | { status: 'ready'; models: string[] }
  | { status: 'not_installed' } // khong tim thay ollama.exe
  | { status: 'not_running' } // co binary nhung server khong len duoc
  | { status: 'no_model' } // server chay nhung chua tai model nao
  | { status: 'error'; message: string }

export interface AiSettings {
  // Model Ollama dung mac dinh khi bam "Soan bang may"
  ollamaModel: string
  // Duong dan ollama.exe do user chi dinh (rong = tu do)
  ollamaPath: string
  // Sau khi Ollama soan -> de Claude ra soat & sua (giu dung thu tu, luu cap
  // truoc/sau lam vi du cho Ollama hoc). Ton mot it token Claude. Mac dinh BAT.
  // TAT -> chay offline thuan (chi Ollama).
  ollamaRefineWithClaude: boolean
  // Khi KHONG dung Claude sua: co chay them luot Ollama tu ra soat & sua khong
  // (cham hon, mac dinh TAT).
  ollamaAutoRefine: boolean
  // Dua cau mau tu ngan hang (cau Claude tao / Claude sua / Ollama da sua / cau
  // user danh dau) vao prompt Ollama de "hoc dan". Prompt dai hon -> cham hon.
  ollamaUseLearnedExamples: boolean
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  // 7B chất lượng tốt hơn hẳn 3B, đủ nhanh trên CPU cho nhu cầu soạn theo mẻ.
  ollamaModel: 'qwen2.5:7b-instruct',
  ollamaPath: '',
  ollamaRefineWithClaude: true,
  ollamaAutoRefine: false,
  ollamaUseLearnedExamples: true
}
