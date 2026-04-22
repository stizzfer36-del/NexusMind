import crypto from 'crypto'
import { BrowserWindow } from 'electron'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'
import type { VoiceConfig, VoiceSession, VoiceSegment } from '@nexusmind/shared'
import { WhisperService } from './voice/WhisperService.js'
import { KokoroService } from './voice/KokoroService.js'

const DEFAULT_CONFIG: VoiceConfig = {
  sttModel: 'whisper-tiny',
  ttsVoice: 'kokoro-en-male-1',
  pushToTalkKey: 'Space',
  autoPlay: true,
}

export class VoiceService {
  private config: VoiceConfig = { ...DEFAULT_CONFIG }
  private sessions = new Map<string, VoiceSession>()
  private whisper = new WhisperService()
  private kokoro = new KokoroService()
  private whisperReady = false
  private kokoroReady = false

  private get settings() {
    return ServiceRegistry.getInstance().resolve(SERVICE_TOKENS.Settings) as any
  }

  async init(): Promise<void> {
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.VoiceService, this)

    // Load persisted config
    try {
      const saved = this.settings.get('voiceConfig', DEFAULT_CONFIG) as VoiceConfig
      if (saved) this.config = { ...DEFAULT_CONFIG, ...saved }
    } catch {}

    // Init sub-services; failures are non-fatal
    try { await this.whisper.init(); this.whisperReady = true } catch (e) {
      console.warn('[VoiceService] Whisper unavailable:', e)
    }
    try { await this.kokoro.init(); this.kokoroReady = true } catch (e) {
      console.warn('[VoiceService] Kokoro unavailable:', e)
    }
  }

  getConfig(): VoiceConfig {
    return this.config
  }

  setConfig(config: VoiceConfig): void {
    this.config = config
    try { this.settings.set('voiceConfig', config) } catch {}
  }

  startSession(): { sessionId: string } {
    const sessionId = crypto.randomUUID()
    const now = Date.now()
    this.sessions.set(sessionId, {
      id: sessionId,
      createdAt: now,
      updatedAt: now,
      segments: [],
    })
    return { sessionId }
  }

  getSession(sessionId: string): VoiceSession | null {
    return this.sessions.get(sessionId) ?? null
  }

  listSessions(): VoiceSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.createdAt - a.createdAt)
  }

  async transcribeChunk(sessionId: string, audioChunk: Buffer): Promise<{ text: string }> {
    if (!this.whisperReady) {
      throw new Error('Whisper STT is not available. Install whisper.cpp to enable voice input.')
    }
    const text = await this.whisper.transcribeChunk(audioChunk)
    if (text) {
      const session = this.sessions.get(sessionId)
      if (session) {
        const now = Date.now()
        const seg: VoiceSegment = {
          id: crypto.randomUUID(),
          direction: 'user',
          text,
          startedAt: now,
          finishedAt: now,
        }
        session.segments.push(seg)
        session.updatedAt = now
      }
    }
    return { text }
  }

  async speakText(text: string): Promise<{ audioId: string }> {
    const audioId = crypto.randomUUID()
    if (!this.kokoroReady) {
      throw new Error('Kokoro TTS is not available. Install kokoro-tts to enable voice output.')
    }
    try {
      const audioBuffer = await this.kokoro.speak(text, this.config.ttsVoice)
      // Push audio to renderer via BrowserWindow webContents
      const wins = BrowserWindow.getAllWindows()
      if (wins.length > 0) {
        wins[0].webContents.send('voice:audioReady', {
          audioId,
          data: Array.from(audioBuffer),
        })
      }
    } catch (err) {
      console.error('[VoiceService] TTS error:', err)
    }
    return { audioId }
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'voice:getConfig': (_event: any) => this.getConfig(),
      'voice:setConfig': (_event: any, config: VoiceConfig) => this.setConfig(config),
      'voice:startSession': (_event: any) => this.startSession(),
      'voice:getSession': (_event: any, sessionId: string) => this.getSession(sessionId),
      'voice:listSessions': (_event: any) => this.listSessions(),
      'voice:transcribeChunk': (_event: any, sessionId: string, audioChunk: Buffer) =>
        this.transcribeChunk(sessionId, audioChunk),
      'voice:speakText': (_event: any, text: string) => this.speakText(text),
    }
  }
}
