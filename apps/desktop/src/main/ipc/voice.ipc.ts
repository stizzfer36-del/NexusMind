import type { VoiceService } from '../services/VoiceService.js'
import type { VoiceConfig } from '@nexusmind/shared'

export function createVoiceIpcHandlers(
  service: VoiceService
): Record<string, (event: any, ...args: any[]) => any> {
  return {
    'voice:getConfig': (_event: any) => service.getConfig(),
    'voice:setConfig': (_event: any, config: VoiceConfig) => service.setConfig(config),
    'voice:startSession': (_event: any) => service.startSession(),
    'voice:getSession': (_event: any, sessionId: string) => service.getSession(sessionId),
    'voice:listSessions': (_event: any) => service.listSessions(),
    'voice:transcribeChunk': (_event: any, sessionId: string, audioChunk: Buffer) =>
      service.transcribeChunk(sessionId, audioChunk),
    'voice:speakText': (_event: any, text: string) => service.speakText(text),
  }
}
