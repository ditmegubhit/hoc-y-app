interface ErrorStream {
  on(event: 'error', listener: (error: NodeJS.ErrnoException) => void): unknown
  removeListener(event: 'error', listener: (error: NodeJS.ErrnoException) => void): unknown
}

/** A GUI app must survive its launcher's logging pipe closing. Test runners can
 * instead exit cleanly when their parent closes the pipe. Other errors still fail. */
export function handleStdioErrors(streams: ErrorStream[], onBrokenPipe: () => void = () => {}): () => void {
  let closed = false
  const handler = (error: NodeJS.ErrnoException): void => {
    if (error.code !== 'EPIPE') throw error
    if (closed) return
    closed = true
    onBrokenPipe()
  }
  streams.forEach((stream) => stream.on('error', handler))
  return () => streams.forEach((stream) => stream.removeListener('error', handler))
}

export function handleProcessStdioErrors(onBrokenPipe?: () => void): void {
  handleStdioErrors([process.stdout, process.stderr], onBrokenPipe)
}
