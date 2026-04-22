import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

const KOKORO_CANDIDATES = [
  'kokoro',
  'kokoro-tts',
  path.join(os.homedir(), '.local/bin/kokoro'),
  path.join(os.homedir(), '.local/bin/kokoro-tts'),
]

function findKokoroBinary(): string | null {
  for (const candidate of KOKORO_CANDIDATES) {
    try {
      const r = spawnSync('which', [candidate], { encoding: 'utf8' })
      if (r.status === 0 && r.stdout.trim()) return candidate
    } catch {}
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

export class KokoroService {
  private binaryPath: string | null = null

  async init(): Promise<void> {
    this.binaryPath = findKokoroBinary()
  }

  async speak(text: string, voiceId: string): Promise<Buffer> {
    if (!this.binaryPath) {
      throw new Error('Kokoro TTS binary not found. Install kokoro-tts and ensure it is on your PATH.')
    }

    const tmpDir = os.tmpdir()
    const outPath = path.join(tmpDir, `kokoro-${crypto.randomUUID()}.wav`)

    try {
      const args = [
        '--text', text,
        '--voice', voiceId,
        '--output', outPath,
        '--format', 'wav',
      ]

      const result = spawnSync(this.binaryPath, args, {
        encoding: 'buffer',
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      })

      if (result.error) throw result.error
      if (result.status !== 0) {
        throw new Error(`Kokoro exited with code ${result.status}: ${result.stderr?.toString() ?? ''}`)
      }

      if (fs.existsSync(outPath)) {
        return fs.readFileSync(outPath)
      }

      // Some Kokoro builds write to stdout instead
      return result.stdout ?? Buffer.alloc(0)
    } finally {
      try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath) } catch {}
    }
  }
}
