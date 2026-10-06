import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { handleStdioErrors } from './stdioErrors'

describe('closed launcher pipes', () => {
  const error = (code: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code })

  it('handles EPIPE on either logging stream and stops a test runner once', () => {
    const stdout = new EventEmitter(); const stderr = new EventEmitter()
    const exit = vi.fn()
    handleStdioErrors([stdout, stderr], exit)
    expect(() => stdout.emit('error', error('EPIPE'))).not.toThrow()
    expect(() => stderr.emit('error', error('EPIPE'))).not.toThrow()
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('keeps GUI apps alive without hiding other I/O failures', () => {
    const stdout = new EventEmitter()
    handleStdioErrors([stdout])
    expect(() => stdout.emit('error', error('EPIPE'))).not.toThrow()
    expect(() => stdout.emit('error', error('EACCES'))).toThrow('EACCES')
  })

  it('removes handlers when disposed', () => {
    const stdout = new EventEmitter()
    const dispose = handleStdioErrors([stdout])
    expect(stdout.listenerCount('error')).toBe(1)
    dispose()
    expect(stdout.listenerCount('error')).toBe(0)
  })
})
