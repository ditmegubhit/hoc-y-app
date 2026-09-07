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

const DEFAULT_TIMEOUT_MS = 120_000

function neutralCwd(): string {
  // cwd rieng, khong co CLAUDE.md/project settings, de tranh CLI vo tinh
  // nap cau hinh la va giu prompt "sach" (giam token, tranh hanh vi khong mong muon).
  const dir = join(app.getPath('userData'), 'claude-cli-scratch')
  mkdirSync(dir, { recursive: true })
  return dir
}

// Giet ca CAY tien trinh. Tren Windows, giet mot minh claude.exe khong dung tay
// cac tien trinh con no da spawn - chung con giu pipe stdout nen su kien 'close'
// khong bao gio ban, Promise treo vo han. taskkill /t xu ly ca cay.
function killTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true })
    } else {
      process.kill(pid, 'SIGKILL')
    }
  } catch {
    // tien trinh co the da thoat - bo qua
  }
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
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false

    const finish = (result: ClaudeCliResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    // Tu quan ly timeout thay vi dua vao option `timeout` cua spawn: khi het gio
    // ta giet ca cay tien trinh VA tra ket qua ngay, khong cho su kien 'close'
    // (co the bi treo tren Windows do tien trinh con giu pipe).
    const timer = setTimeout(() => {
      timedOut = true
      if (child.pid != null) killTree(child.pid)
      finish({ ok: false, errorMessage: 'Hết thời gian chờ phản hồi từ Claude CLI.' })
    }, params.timeoutMs ?? DEFAULT_TIMEOUT_MS)

    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))

    child.on('error', (err) => {
      finish({ ok: false, errorMessage: `Không tìm thấy Claude Code CLI: ${err.message}` })
    })

    child.on('close', (code) => {
      if (timedOut) return
      try {
        const envelope = JSON.parse(stdout) as {
          is_error?: boolean
          result?: string
          structured_output?: unknown
          total_cost_usd?: number
        }
        if (envelope.is_error) {
          finish({ ok: false, errorMessage: envelope.result ?? stderr })
          return
        }
        finish({
          ok: true,
          structuredOutput: envelope.structured_output,
          resultText: envelope.result,
          totalCostUsd: envelope.total_cost_usd
        })
      } catch {
        finish({
          ok: false,
          errorMessage: `Không parse được output CLI: ${stderr || stdout || `(thoát mã ${code})`}`
        })
      }
    })

    child.stdin?.write(params.prompt, 'utf8')
    child.stdin?.end()
  })
}
