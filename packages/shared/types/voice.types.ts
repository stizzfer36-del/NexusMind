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
