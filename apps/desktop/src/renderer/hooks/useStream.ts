import { useCallback, useEffect, useRef, useState } from 'react'

export function useStream(source: AsyncIterable<string> | null) {
  const [text, setText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef(false)

  const reset = useCallback(() => {
    setText('')
    setIsStreaming(false)
  }, [])

  useEffect(() => {
    if (!source) {
      setText('')
      setIsStreaming(false)
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

  return { text, isStreaming, reset }
}
