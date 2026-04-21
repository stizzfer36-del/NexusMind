import { BrowserWindow } from 'electron'
import path from 'node:path'
import { WindowManager } from './WindowManager.js'

export function createBenchWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, '../../preload/index.js'),
      contextIsolation: true,
      webSecurity: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(path.join(__dirname, '../../renderer/index.html'))
  }

  WindowManager.getInstance().register('bench', window)
  return window
}
