import { app } from 'electron'
import { WindowManager } from './windows/WindowManager.js'
import { createMainWindow } from './windows/MainWindow.js'
import { IPCRouter } from './ipc/IPCRouter.js'
import { channels } from './ipc/channels.js'
import { DatabaseService } from './services/DatabaseService.js'
import { SettingsService } from './services/SettingsService.js'
import { KeychainService } from './services/KeychainService.js'
import { ModelRouter } from './services/ModelRouter.js'
import { PtyManager } from './services/PtyManager.js'
import { KanbanService } from './services/KanbanService.js'
import { SwarmService } from './services/SwarmService.js'
import { MemoryService } from './services/MemoryService.js'
import { MCPService } from './services/MCPService.js'

async function bootstrap(): Promise<void> {
  const db = new DatabaseService()
  await db.init()

  const settings = new SettingsService()
  await settings.init()

  const keychain = new KeychainService()
  await keychain.init()

  const modelRouter = new ModelRouter()
  await modelRouter.init()

  const ptyManager = new PtyManager()
  await ptyManager.init()

  const kanban = new KanbanService()
  await kanban.init()

  const swarm = new SwarmService()
  await swarm.init()

  const memory = new MemoryService()
  await memory.init()

  const mcp = new MCPService()
  await mcp.init()

  const router = new IPCRouter()
  const allHandlers: Record<string, any> = {
    ...channels,
    ...db.getHandlers(),
    ...settings.getHandlers(),
    ...keychain.getHandlers(),
    ...modelRouter.getHandlers(),
    ...ptyManager.getHandlers(),
    ...kanban.getHandlers(),
    ...swarm.getHandlers(),
    ...memory.getHandlers(),
    ...mcp.getHandlers(),
  }
  router.registerAll(allHandlers)

  createMainWindow()
}

app.whenReady().then(bootstrap).catch(console.error)

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
