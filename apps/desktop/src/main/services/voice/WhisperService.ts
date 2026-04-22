import { execSync, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

const WHISPER_CANDIDATES = [
  'whisper-cli',
  'whisper.cpp',
  'main',           // whisper.cpp default build name
  '/usr/local/bin/whisper-cli',
  path.join(os.homedir(), '.local/bin/whisper-cli'),
]

function findWhisperBinary(): string | null {
  for (const candidate of WHISPER_CANDIDATES) {
    try {
      const result = spawnSync('which', [candidate], { encoding: 'utf8' })
      if (result.status === 0 && result.stdout.trim()) return candidate
    } catch {}
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

export class WhisperService {
  private binaryPath: string | null = null
  private modelPath: string | null = null

  async init(): Promise<void> {
    this.binaryPath = findWhisperBinary()
    // Try to find a model file in common locations
    const modelCandidates = [
      path.join(os.homedir(), '.cache/whisper/ggml-tiny.en.bin'),
      path.join(os.homedir(), '.cache/whisper/ggml-base.en.bin'),
      '/usr/share/whisper/ggml-tiny.en.bin',
    ]
    for (const m of modelCandidates) {
      if (fs.existsSync(m)) { this.modelPath = m; break }
    }
  }

  async transcribeChunk(audio: Buffer): Promise<string> {
    if (!this.binaryPath) {
      throw new Error('Whisper binary not found. Install whisper.cpp and ensure it is on your PATH.')
    }

    // Write raw PCM to a temp WAV file (16kHz mono, 16-bit)
    const tmpDir = os.tmpdir()
    const wavPath = path.join(tmpDir, `whisper-${crypto.randomUUID()}.wav`)
    try {
      writeWav(wavPath, audio, 16000, 1)
      const args = [
        '-f', wavPath,
        '--output-json',
        '--no-timestamps',
        '--language', 'en',
      ]
      if (this.modelPath) args.push('-m', this.modelPath)

      const result = spawnSync(this.binaryPath, args, {
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024,
      })

      if (result.error) throw result.error

      // Try JSON output first
      const jsonPath = wavPath.replace('.wav', '.wav.json')
      if (fs.existsSync(jsonPath)) {
        try {
          const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
          return (json.transcription ?? []).map((s: any) => s.text).join(' ').trim()
        } catch {}
      }

      // Fall back to stdout
      return (result.stdout ?? '').trim()
    } finally {
      try { fs.unlinkSync(wavPath) } catch {}
    }
  }
}

function writeWav(filePath: string, pcm: Buffer, sampleRate: number, channels: number): void {
  const dataSize = pcm.length
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)         // PCM
  header.writeUInt16LE(1, 20)          // PCM format
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * channels * 2, 28)
  header.writeUInt16LE(channels * 2, 32)
  header.writeUInt16LE(16, 34)         // 16-bit
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)
  fs.writeFileSync(filePath, Buffer.concat([header, pcm]))
}
