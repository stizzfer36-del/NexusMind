import { contextBridge, ipcRenderer } from 'electron'
import type { IpcEvents, IpcRendererEvents } from '@nexusmind/shared/ipc-channels'

const listenerMap = new WeakMap<Function, Function>()

const nexusAPI = {
  invoke<K extends keyof IpcEvents>(
    channel: K,
    ...args: Parameters<IpcEvents[K]>
  ): Promise<ReturnType<IpcEvents[K]>> {
    return ipcRenderer.invoke(channel, ...args)
  },

  on<K extends keyof IpcRendererEvents>(
    channel: K,
    callback: IpcRendererEvents[K]
  ): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: Parameters<IpcRendererEvents[K]>) => {
      ;(callback as (...args: any[]) => void)(...args)
    }
    listenerMap.set(callback, wrapped)
    ipcRenderer.on(channel, wrapped)
    return () => {
      ipcRenderer.removeListener(channel, wrapped)
    }
  },

  off<K extends keyof IpcRendererEvents>(
    channel: K,
    callback: IpcRendererEvents[K]
  ): void {
    const wrapped = listenerMap.get(callback)
    if (wrapped) {
      ipcRenderer.removeListener(channel, wrapped as any)
    }
  },

  once<K extends keyof IpcRendererEvents>(
    channel: K,
    callback: IpcRendererEvents[K]
  ): void {
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: Parameters<IpcRendererEvents[K]>) => {
      ;(callback as (...args: any[]) => void)(...args)
    }
    ipcRenderer.once(channel, wrapped)
  },
}

contextBridge.exposeInMainWorld('nexusAPI', nexusAPI)
