import { BrowserWindow } from 'electron'
import path from 'node:path'
import { WindowManager } from './WindowManager.js'
import { createMainWindow } from './MainWindow.js'

export function createOnboardingWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 600,
    height: 500,
    frame: false,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, '../../preload/index.js'),
      contextIsolation: true,
      webSecurity: false,
    },
  })

  window.setMenuBarVisibility(false)

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(path.join(__dirname, '../../renderer/index.html'))
  }

  window.on('close', () => {
    if (!WindowManager.getInstance().get('main')) {
      createMainWindow()
    }
  })

  WindowManager.getInstance().register('onboarding', window)
  return window
}
