import { useCallback, useEffect, useRef, useState } from 'react'

interface StreamOptions {
  modelId: string
  messages: Array<{ role: string; content: string }>
}

export function useStream(source?: AsyncIterable<string> | null) {
  const [text, setText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)
  const unsubRef = useRef<(() => void) | null>(null)
  const streamIdRef = useRef<string | null>(null)

  const reset = useCallback(() => {
    setText('')
    setIsStreaming(false)
    setError(null)
    abortRef.current = false
    streamIdRef.current = null
    if (unsubRef.current) {
      unsubRef.current()
      unsubRef.current = null
    }
  }, [])

  // Existing: handle AsyncIterable<string>
  useEffect(() => {
    if (!source) {
      if (source === null) {
        setText('')
        setIsStreaming(false)
      }
      return
    }

    abortRef.current = false
    setText('')
    setIsStreaming(true)

    let cancelled = false

    ;(async () => {
      try {
        for await (const chunk of source) {
          if (cancelled || abortRef.current) break
          setText((prev) => prev + chunk)
        }
      } finally {
        if (!cancelled && !abortRef.current) {
          setIsStreaming(false)
        }
      }
    })()

    return () => {
      cancelled = true
      abortRef.current = true
      setIsStreaming(false)
    }
  }, [source])

  // New: IPC-based model streaming
  const startStream = useCallback(
    async (options: StreamOptions) => {
      reset()
      abortRef.current = false
      setIsStreaming(true)

      let currentStreamId: string | null = null

      const onToken = (payload: { streamId: string; token: string; index: number }) => {
        if (abortRef.current) return
        if (payload.streamId !== currentStreamId) return
        setText((prev) => prev + payload.token)
      }

      const onDone = (payload: { streamId: string; finishReason?: string; usage?: any }) => {
        if (payload.streamId !== currentStreamId) return
        setIsStreaming(false)
        cleanup()
      }

      const onError = (payload: { streamId: string; error: string }) => {
        if (payload.streamId !== currentStreamId) return
        setError(payload.error)
        setIsStreaming(false)
        cleanup()
      }

      const unsubToken = window.electronAPI.on('model:token', onToken)
      const unsubDone = window.electronAPI.on('model:done', onDone)
      const unsubError = window.electronAPI.on('model:error', onError)

      function cleanup() {
        unsubToken()
        unsubDone()
        unsubError()
        unsubRef.current = null
      }

      unsubRef.current = cleanup

      try {
        const result = (await window.electronAPI.invoke('model:stream', {
          modelId: options.modelId,
          messages: options.messages,
        })) as { streamId: string; ok: boolean; error?: string }

        if (!result.ok) {
          setError(result.error ?? 'Stream failed to start')
          setIsStreaming(false)
          cleanup()
          return
        }

        currentStreamId = result.streamId
        streamIdRef.current = currentStreamId
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        setIsStreaming(false)
        cleanup()
      }
    },
    [reset],
  )

  return { text, isStreaming, error, reset, startStream }
}
