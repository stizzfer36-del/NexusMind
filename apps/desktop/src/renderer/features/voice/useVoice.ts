import { useCallback } from 'react'
import { useIPC } from '../../hooks'
import { useVoiceStore } from '../../stores/voice.store'
import type { VoiceConfig } from '@nexusmind/shared'

export function useVoice() {
  const store = useVoiceStore()
  const getConfigIPC = useIPC<'voice:getConfig'>()
  const setConfigIPC = useIPC<'voice:setConfig'>()
  const startSessionIPC = useIPC<'voice:startSession'>()
  const getSessionIPC = useIPC<'voice:getSession'>()
  const listSessionsIPC = useIPC<'voice:listSessions'>()
  const transcribeIPC = useIPC<'voice:transcribeChunk'>()
  const speakIPC = useIPC<'voice:speakText'>()

  const initVoice = useCallback(async () => {
    try {
      const cfg = await getConfigIPC.invoke('voice:getConfig')
      if (cfg && typeof cfg === 'object' && !('error' in cfg)) {
        store.setConfig(cfg as VoiceConfig)
      }
    } catch {}
    try {
      const result = await startSessionIPC.invoke('voice:startSession')
      if (result && (result as any).sessionId) {
        store.setSessionId((result as any).sessionId)
      } else {
        store.setError('Voice service unavailable')
      }
    } catch (e) {
      store.setError(String(e))
    }
  }, [store, getConfigIPC, startSessionIPC])

  const updateConfig = useCallback(async (config: VoiceConfig) => {
    store.setConfig(config)
    try { await setConfigIPC.invoke('voice:setConfig', config) } catch {}
  }, [store, setConfigIPC])

  const transcribeChunk = useCallback(async (audioChunk: ArrayBuffer) => {
    if (!store.sessionId) throw new Error('No active session')
    store.setStatus('processing')
    try {
      const { text } = await transcribeIPC.invoke('voice:transcribeChunk', store.sessionId, audioChunk as any)
      return text
    } finally {
      store.setStatus('idle')
    }
  }, [store, transcribeIPC])

  const speakText = useCallback(async (text: string) => {
    store.setStatus('speaking')
    try {
      await speakIPC.invoke('voice:speakText', text)
    } catch (e) {
      store.setError(String(e))
      store.setStatus('error')
    }
  }, [store, speakIPC])

  return {
    ...store,
    initVoice,
    updateConfig,
    transcribeChunk,
    speakText,
  }
}
