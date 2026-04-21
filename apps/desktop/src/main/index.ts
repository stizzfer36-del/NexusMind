import { app } from 'electron'
import { WindowManager } from './windows/WindowManager.js'
import { createMainWindow } from './windows/MainWindow.js'
import { IPCRouter } from './ipc/IPCRouter.js'
import { channels } from './ipc/channels.js'

app.whenReady().then(() => {
  const router = new IPCRouter()
  router.registerAll(channels)
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
