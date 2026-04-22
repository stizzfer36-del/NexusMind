import { useState, useCallback } from 'react'
import type { VoiceConfig, VoiceSegment, VoiceStatus } from '@nexusmind/shared'

export function useVoiceStore() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [config, setConfig] = useState<VoiceConfig | null>(null)
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [segments, setSegments] = useState<VoiceSegment[]>([])
  const [error, setError] = useState<string | undefined>(undefined)

  const clearError = useCallback(() => setError(undefined), [])

  const upsertSegment = useCallback((seg: VoiceSegment) => {
    setSegments(prev => {
      const idx = prev.findIndex(s => s.id === seg.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = seg
        return next
      }
      return [...prev, seg]
    })
  }, [])

  return {
    sessionId,
    config,
    status,
    segments,
    error,
    setSessionId,
    setConfig,
    setStatus,
    setSegments,
    setError,
    clearError,
    upsertSegment,
  }
}
