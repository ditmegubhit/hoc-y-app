import { spawn } from 'node:child_process'
import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export interface ClaudeCliResult {
  ok: boolean
  structuredOutput?: unknown
  resultText?: string
  errorMessage?: string
  totalCostUsd?: number
}

function neutralCwd(): string {
  // cwd rieng, khong co CLAUDE.md/project settings, de tranh CLI vo tinh
  // nap cau hinh la va giu prompt "sach" (giam token, tranh hanh vi khong mong muon).
  const dir = join(app.getPath('userData'), 'claude-cli-scratch')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function runClaudeHeadless(params: {
  prompt: string
  jsonSchema?: Record<string, unknown>
  timeoutMs?: number
}): Promise<ClaudeCliResult> {
  return new Promise((resolve) => {
    const args = [
      '-p',
      '--output-format',
      'json',
      '--tools',
      '',
      '--permission-mode',
      'dontAsk',
      '--no-session-persistence',
      '--setting-sources',
      'user'
    ]
    if (params.jsonSchema) {
      args.push('--json-schema', JSON.stringify(params.jsonSchema))
    }

    // shell:false + truyen prompt qua stdin (khong qua argv) de tranh gioi han
    // do dai command-line cua Windows va toan bo van de escaping ky tu tieng Viet.
    const child = spawn('claude', args, {
      cwd: neutralCwd(),
      shell: false,
      timeout: params.timeoutMs ?? 120_000,
      killSignal: 'SIGTERM'
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))

    child.on('error', (err) => {
      resolve({ ok: false, errorMessage: `Không tìm thấy Claude Code CLI: ${err.message}` })
    })

    child.on('close', (_code, signal) => {
      if (signal === 'SIGTERM') {
        resolve({ ok: false, errorMessage: 'Hết thời gian chờ phản hồi từ Claude CLI.' })
        return
      }
      try {
        const envelope = JSON.parse(stdout) as {
          is_error?: boolean
          result?: string
          structured_output?: unknown
          total_cost_usd?: number
        }
        if (envelope.is_error) {
          resolve({ ok: false, errorMessage: envelope.result ?? stderr })
          return
        }
        resolve({
          ok: true,
          structuredOutput: envelope.structured_output,
          resultText: envelope.result,
          totalCostUsd: envelope.total_cost_usd
        })
      } catch {
        resolve({ ok: false, errorMessage: `Không parse được output CLI: ${stderr || stdout}` })
      }
    })

    child.stdin?.write(params.prompt, 'utf8')
    child.stdin?.end()
  })
}
