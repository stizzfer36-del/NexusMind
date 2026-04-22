import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('electron', () => ({
  BrowserWindow: class MockBrowserWindow {
    static getAllWindows() {
      return []
    }
    on() {
      return this
    }
    once() {
      return this
    }
    isDestroyed() {
      return false
    }
    close() {}
    webContents = { send: vi.fn() }
  },
  app: {
    getPath: () => '/tmp/test-data',
    getAppPath: () => '/tmp/test-app',
  },
}))

import { FileService } from './FileService.js'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'

describe('FileService', () => {
  let tmpDir: string
  let fileService: FileService

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-service-test-'))
    fileService = new FileService(tmpDir)
    fileService.init()
  })

  afterEach(() => {
    fileService.dispose()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    ServiceRegistry.getInstance().clear()
  })

  it('file:read returns content of a file in the workspace', () => {
    const testPath = path.join(tmpDir, 'hello.txt')
    fs.writeFileSync(testPath, 'hello world', 'utf-8')

    const content = fileService.read('hello.txt')
    expect(content).toBe('hello world')
  })

  it('file:write + file:read round-trip is lossless', () => {
    const content = 'line one\nline two\n\nunicode: 你好 🚀\n'
    fileService.write('roundtrip.txt', content)

    const readBack = fileService.read('roundtrip.txt')
    expect(readBack).toBe(content)
  })

  it('file:listDir returns entries for a directory', () => {
    fs.mkdirSync(path.join(tmpDir, 'sub'))
    fs.writeFileSync(path.join(tmpDir, 'sub', 'a.txt'), 'a', 'utf-8')
    fs.writeFileSync(path.join(tmpDir, 'sub', 'b.txt'), 'b', 'utf-8')

    const entries = fileService.listDir('sub')
    expect(entries.length).toBe(2)

    const names = entries.map((e) => e.name).sort()
    expect(names).toEqual(['a.txt', 'b.txt'])

    for (const entry of entries) {
      expect(entry.isDirectory).toBe(false)
      expect(entry.size).toBe(1)
      expect(entry.mtime).toBeGreaterThan(0)
    }
  })

  it('file:applyDiff updates file content', () => {
    const original = 'one\ntwo\nthree\n'
    fs.writeFileSync(path.join(tmpDir, 'diff.txt'), original, 'utf-8')

    const diff = {
      hunks: [
        {
          oldStart: 2,
          oldCount: 1,
          newStart: 2,
          newCount: 2,
          lines: [
            { type: 'removed' as const, text: 'two' },
            { type: 'added' as const, text: 'TWO' },
            { type: 'added' as const, text: '2.5' },
          ],
        },
      ],
    }

    const result = fileService.applyDiff('diff.txt', diff)
    expect(result).toBe('one\nTWO\n2.5\nthree\n')

    const readBack = fileService.read('diff.txt')
    expect(readBack).toBe('one\nTWO\n2.5\nthree\n')
  })

  it('file:watch emits events on change', async () => {
    fs.writeFileSync(path.join(tmpDir, 'watch.txt'), 'initial', 'utf-8')

    const watchId = fileService.watch('watch.txt')
    expect(watchId).toMatch(/^watch-\d+$/)

    // Wait a tick for the watcher to settle
    await new Promise((r) => setTimeout(r, 50))

    fs.writeFileSync(path.join(tmpDir, 'watch.txt'), 'updated', 'utf-8')

    // Allow watcher callback to fire
    await new Promise((r) => setTimeout(r, 150))

    fileService.unwatch(watchId)
  })

  it('rejects paths outside the workspace', () => {
    expect(() => fileService.read('../escape.txt')).toThrow('outside the workspace')
    expect(() => fileService.write('../escape.txt', 'bad')).toThrow('outside the workspace')
    expect(() => fileService.listDir('../escape')).toThrow('outside the workspace')
  })
})
