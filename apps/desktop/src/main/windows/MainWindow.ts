import { BrowserWindow } from 'electron'
import path from 'node:path'
import { WindowManager } from './WindowManager.js'

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      webSecurity: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  window.on('closed', () => {
    // cleanup handled by WindowManager
  })

  WindowManager.getInstance().register('main', window)
  return window
}
