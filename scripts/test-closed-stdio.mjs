import { spawn } from 'node:child_process'

const moduleUrl = new URL('../src/main/services/runtime/stdioErrors.ts', import.meta.url).href
for (const testRunner of [false, true]) {
  await new Promise((resolve, reject) => {
    let handled = false
    const code = `import { handleProcessStdioErrors } from ${JSON.stringify(moduleUrl)};
      handleProcessStdioErrors(${testRunner ? "() => process.send('handled', () => process.exit(0))" : ''});
      process.on('message', () => {
        console.log('Write after the launcher closed stdout');
        ${testRunner ? '' : "setTimeout(() => process.send('handled', () => process.exit(0)), 100);"}
      });
      process.send('ready');`
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true })
    const timer = setTimeout(() => { child.kill(); reject(new Error('Closed-pipe check timed out')) }, 10000)
    let stderr = ''
    child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('message', (message) => {
      if (message === 'ready') {
        child.stdout.destroy()
        setTimeout(() => child.send('write'), 100)
      }
      if (message === 'handled') handled = true
    })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('exit', (exitCode) => {
      clearTimeout(timer)
      if (exitCode !== 0 || !handled) reject(new Error(`Closed-pipe check failed: ${stderr}`))
      else resolve()
    })
  })
  console.log(`Closed stdout: ${testRunner ? 'test runner exits without a dialog' : 'GUI logging survives'} — passed`)
}
