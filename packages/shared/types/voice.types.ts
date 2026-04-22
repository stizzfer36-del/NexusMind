export enum VoiceMode {
  PUSH_TO_TALK = 'push_to_talk',
  CONTINUOUS = 'continuous',
  HYBRID = 'hybrid',
  OFF = 'off'
}

export interface TranscriptSegment {
  id: string
  text: string
  speaker: string
  startMs: number
  endMs: number
  confidence: number
  language: string
}

export interface TTSRequest {
  id: string
  text: string
  voiceId: string
  speed: number
  language: string
  format: 'mp3' | 'wav' | 'ogg' | 'pcm'
}

export interface DictionaryEntry {
  word: string
  phonetic?: string
  definitions: string[]
  partOfSpeech: string
  synonyms: string[]
  examples: string[]
}

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'

export interface VoiceSegment {
  id: string
  direction: 'user' | 'assistant'
  text: string
  startedAt: number
  finishedAt: number
}

export interface VoiceSession {
  id: string
  createdAt: number
  updatedAt: number
  segments: VoiceSegment[]
}

export interface VoiceConfig {
  sttModel: string
  ttsVoice: string
  pushToTalkKey: string
  autoPlay: boolean
}
