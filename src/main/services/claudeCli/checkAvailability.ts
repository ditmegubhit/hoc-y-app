import { spawn } from 'node:child_process'
import type { ClaudeCliStatus } from '../../../shared/types/claudeCli'

export function checkClaudeCliAvailability(): Promise<ClaudeCliStatus> {
  return new Promise((resolve) => {
    const child = spawn('claude', ['auth', 'status'], { shell: false, timeout: 8000 })
    let stdout = ''
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
    child.on('error', () => resolve({ status: 'not_found' }))
    child.on('close', () => {
      try {
        const info = JSON.parse(stdout) as {
          loggedIn?: boolean
          email?: string
          subscriptionType?: string
        }
        resolve(
          info.loggedIn
            ? { status: 'ready', email: info.email, subscriptionType: info.subscriptionType }
            : { status: 'not_logged_in' }
        )
      } catch {
        resolve({ status: 'error', message: stdout })
      }
    })
  })
}
