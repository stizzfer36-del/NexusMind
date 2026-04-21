import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('nexusAPI', {
  ping: (): string => 'pong'
})
