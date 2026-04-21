import { ipcMain, IpcMainInvokeEvent } from 'electron'

type InvokeHandler = (event: IpcMainInvokeEvent, ...args: any[]) => any

type PushHandler = (event: Electron.IpcMainEvent, ...args: any[]) => void

export class IPCRouter {
  private readonly registeredChannels = new Set<string>()

  register(channel: string, handler: InvokeHandler): void {
    ipcMain.handle(channel, handler)
    this.registeredChannels.add(channel)
  }

  registerPush(channel: string, handler: PushHandler): void {
    ipcMain.on(channel, handler)
    this.registeredChannels.add(channel)
  }

  registerAll(handlers: Record<string, InvokeHandler>): void {
    for (const [channel, handler] of Object.entries(handlers)) {
      this.register(channel, handler)
    }
  }

  dispose(): void {
    for (const channel of this.registeredChannels) {
      try {
        ipcMain.removeHandler(channel)
      } catch {
        // no invoke handler to remove
      }
      ipcMain.removeAllListeners(channel)
    }
    this.registeredChannels.clear()
  }
}
