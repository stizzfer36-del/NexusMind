import type { IpcEvents, IpcRendererEvents } from '@nexusmind/shared/ipc-channels'

export interface ElectronAPI {
  invoke<K extends keyof IpcEvents>(
    channel: K,
    ...args: Parameters<IpcEvents[K]>
  ): Promise<ReturnType<IpcEvents[K]>>

  on<K extends keyof IpcRendererEvents>(
    channel: K,
    callback: IpcRendererEvents[K]
  ): () => void

  off<K extends keyof IpcRendererEvents>(
    channel: K,
    callback: IpcRendererEvents[K]
  ): void

  once<K extends keyof IpcRendererEvents>(
    channel: K,
    callback: IpcRendererEvents[K]
  ): void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
