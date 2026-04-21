import { BrowserWindow } from 'electron'
import { EventEmitter } from 'node:events'

export type WindowLifecycleEvent =
  | 'window:registered'
  | 'window:closed'
  | 'window:all-closed'

export class WindowManager extends EventEmitter {
  private static instance: WindowManager | null = null
  private readonly windows = new Map<string, BrowserWindow>()

  private constructor() {
    super()
  }

  static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager()
    }
    return WindowManager.instance
  }

  register(name: string, window: BrowserWindow): void {
    this.windows.set(name, window)
    this.emit('window:registered', name, window)

    window.on('closed', () => {
      this.windows.delete(name)
      this.emit('window:closed', name, window)
      if (this.windows.size === 0) {
        this.emit('window:all-closed')
      }
    })
  }

  get(name: string): BrowserWindow | undefined {
    return this.windows.get(name)
  }

  close(name: string): void {
    const window = this.windows.get(name)
    if (window && !window.isDestroyed()) {
      window.close()
    }
  }

  closeAll(): void {
    for (const [name] of this.windows) {
      this.close(name)
    }
  }
}
