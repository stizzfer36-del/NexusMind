import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useIPC, useIPCEvent } from '../../hooks'
import type { VoiceSegment, VoiceStatus } from '@nexusmind/shared'
import styles from './VoicePanel.module.css'

const STATUS_CLASS: Record<VoiceStatus, string> = {
  idle: styles.statusIdle,
  listening: styles.statusListening,
  processing: styles.statusProcessing,
  speaking: styles.statusSpeaking,
  error: styles.statusError,
}

const MicIcon = ({ active }: { active: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="6" y="1" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M3 9a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <line x1="9" y1="15" x2="9" y2="17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <line x1="6" y1="17" x2="12" y2="17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    {active && <circle cx="14" cy="4" r="2.5" fill="#ef4444"/>}
  </svg>
)

function fmt(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function VoicePanel() {
  const getConfigIPC = useIPC<'voice:getConfig'>()
  const setConfigIPC = useIPC<'voice:setConfig'>()
  const startSessionIPC = useIPC<'voice:startSession'>()
  const transcribeIPC = useIPC<'voice:transcribeChunk'>()
  const speakIPC = useIPC<'voice:speakText'>()

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [segments, setSegments] = useState<VoiceSegment[]>([])
  const [partial, setPartial] = useState('')
  const [textInput, setTextInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pushKey, setPushKey] = useState('Space')
  const [micLevel, setMicLevel] = useState<number[]>(Array(8).fill(2))

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const isListeningRef = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)

  // Load config and start session on mount
  useEffect(() => {
    getConfigIPC.invoke('voice:getConfig')
      .then(cfg => { if (cfg?.pushToTalkKey) setPushKey(cfg.pushToTalkKey) })
      .catch(() => {})
    startSessionIPC.invoke('voice:startSession')
      .then(({ sessionId: sid }) => setSessionId(sid))
      .catch(e => setError(String(e)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [segments, partial])

  // Play audio when TTS is ready
  useIPCEvent('voice:audioReady', useCallback((payload: { audioId: string; data: number[] }) => {
    setStatus('speaking')
    try {
      const ctx = new AudioContext()
      const buf = new Uint8Array(payload.data).buffer
      ctx.decodeAudioData(buf, decoded => {
        const src = ctx.createBufferSource()
        src.buffer = decoded
        src.connect(ctx.destination)
        src.start()
        src.onended = () => { setStatus('idle'); ctx.close() }
      }, () => { setStatus('idle') })
    } catch { setStatus('idle') }
  }, []))

  // Waveform animation while listening
  const startWaveform = useCallback((stream: MediaStream) => {
    audioCtxRef.current = new AudioContext()
    const source = audioCtxRef.current.createMediaStreamSource(stream)
    analyserRef.current = audioCtxRef.current.createAnalyser()
    analyserRef.current.fftSize = 32
    source.connect(analyserRef.current)
    const data = new Uint8Array(analyserRef.current.frequencyBinCount)
    const tick = () => {
      analyserRef.current?.getByteFrequencyData(data)
      setMicLevel(Array.from(data.slice(0, 8)).map(v => Math.max(2, (v / 255) * 24)))
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
  }, [])

  const stopWaveform = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current)
    setMicLevel(Array(8).fill(2))
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    analyserRef.current = null
  }, [])

  const startListening = useCallback(async () => {
    if (isListeningRef.current || !sessionId) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      startWaveform(stream)
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start(500) // 500ms chunks
      recorderRef.current = recorder
      isListeningRef.current = true
      setStatus('listening')
    } catch (e) {
      setError(`Microphone access denied: ${e}`)
    }
  }, [sessionId, startWaveform])

  const stopListening = useCallback(async () => {
    if (!isListeningRef.current || !recorderRef.current || !sessionId) return
    isListeningRef.current = false
    stopWaveform()
    const recorder = recorderRef.current
    recorder.stop()
    recorder.stream.getTracks().forEach(t => t.stop())
    recorderRef.current = null
    setStatus('processing')

    // Collect all chunks and transcribe
    await new Promise<void>(resolve => { recorder.onstop = () => resolve() })
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    chunksRef.current = []
    if (blob.size < 100) { setStatus('idle'); return }

    try {
      const arrayBuf = await blob.arrayBuffer()
      const { text } = await transcribeIPC.invoke('voice:transcribeChunk', sessionId, arrayBuf as any)
      setPartial('')
      if (text) {
        const now = Date.now()
        setSegments(prev => [...prev, {
          id: crypto.randomUUID(),
          direction: 'user',
          text,
          startedAt: now,
          finishedAt: now,
        }])
        // Speak the text back via TTS (echoed via VoiceService)
        setStatus('processing')
        await speakIPC.invoke('voice:speakText', text).catch(() => {})
      } else {
        setStatus('idle')
      }
    } catch (e) {
      setError(String(e))
      setStatus('error')
    }
  }, [sessionId, stopWaveform, transcribeIPC, speakIPC])

  // Push-to-talk keyboard handler
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === pushKey && !e.repeat && status === 'idle') {
        e.preventDefault()
        startListening()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === pushKey && isListeningRef.current) {
        e.preventDefault()
        stopListening()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [pushKey, status, startListening, stopListening])

  const handleTextSend = useCallback(async () => {
    const text = textInput.trim()
    if (!text || !sessionId) return
    setTextInput('')
    const now = Date.now()
    setSegments(prev => [...prev, { id: crypto.randomUUID(), direction: 'user', text, startedAt: now, finishedAt: now }])
    setStatus('processing')
    try {
      await speakIPC.invoke('voice:speakText', text)
    } catch (e) {
      setError(String(e))
      setStatus('error')
    }
  }, [textInput, sessionId, speakIPC])

  const toggleMic = useCallback(() => {
    if (status === 'listening') stopListening()
    else if (status === 'idle') startListening()
  }, [status, startListening, stopListening])

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button
          className={`${styles.micBtn} ${status === 'listening' ? styles.micBtnActive : ''}`}
          onClick={toggleMic}
          disabled={status === 'processing' || status === 'speaking'}
          title="Push to talk (or hold Space)"
        >
          <MicIcon active={status === 'listening'} />
        </button>

        <span className={`${styles.statusPill} ${STATUS_CLASS[status]}`}>{status}</span>

        {status === 'listening' && (
          <div className={styles.waveform}>
            {micLevel.map((h, i) => (
              <div key={i} className={styles.waveBar} style={{ height: `${h}px` }} />
            ))}
          </div>
        )}

        <span className={styles.hintText}>Hold {pushKey} to talk</span>
      </div>

      {error && (
        <div className={styles.errorBar}>
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className={styles.transcript}>
        {segments.length === 0 && !partial && (
          <div className={styles.empty}>
            Hold <strong>Space</strong> or click the mic to start speaking
          </div>
        )}
        {segments.map(seg => (
          <div key={seg.id} className={seg.direction === 'user' ? styles.segmentUser : styles.segmentAssistant}>
            <div>
              <div className={`${styles.bubble} ${seg.direction === 'user' ? styles.bubbleUser : styles.bubbleAssistant}`}>
                {seg.text}
              </div>
              <div className={styles.segmentTime}>{fmt(seg.startedAt)}</div>
            </div>
          </div>
        ))}
        {partial && <div className={styles.partialText}>{partial}…</div>}
        <div ref={transcriptEndRef} />
      </div>

      <div className={styles.footer}>
        <input
          className={styles.textInput}
          placeholder="Type instead of speaking…"
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleTextSend()}
        />
        <button
          className={styles.sendBtn}
          onClick={handleTextSend}
          disabled={!textInput.trim() || status !== 'idle'}
        >
          Send
        </button>
      </div>
    </div>
  )
}
