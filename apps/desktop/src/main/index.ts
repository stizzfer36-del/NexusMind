import { app } from 'electron'
import { WindowManager } from './windows/WindowManager.js'
import { createMainWindow } from './windows/MainWindow.js'

app.whenReady().then(() => {
  createMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (WindowManager.getInstance().get('main') === undefined) {
    createMainWindow()
  }
})
