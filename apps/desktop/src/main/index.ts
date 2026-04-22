import { app, Menu } from 'electron'
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
import { EventRecorder } from './services/EventRecorder.js'
import { BenchService } from './services/BenchService.js'
import { GraphService } from './services/graph/GraphService.js'
import { GuardService } from './services/GuardService.js'
import { VoiceService } from './services/VoiceService.js'
import { LinkService } from './services/LinkService.js'
import { SyncService } from './services/SyncService.js'

const failedServices: string[] = []

async function safeInit(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error(`[bootstrap] Failed to init ${name}:`, err)
    failedServices.push(name)
  }
}

function setupAutoUpdater(): void {
  // TODO(P14): install electron-updater and configure a publish provider before enabling.
  // Example: import { autoUpdater } from 'electron-updater'
  //          if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify()
}

async function bootstrap(): Promise<void> {
  const db = new DatabaseService()
  await safeInit('DatabaseService', () => db.init())

  const settings = new SettingsService()
  await safeInit('SettingsService', () => settings.init())

  const keychain = new KeychainService()
  await safeInit('KeychainService', () => keychain.init())

  const modelRouter = new ModelRouter()
  await safeInit('ModelRouter', () => modelRouter.init())

  const ptyManager = new PtyManager()
  await safeInit('PtyManager', () => ptyManager.init())

  const kanban = new KanbanService()
  await safeInit('KanbanService', () => kanban.init())

  const memory = new MemoryService()
  await safeInit('MemoryService', () => memory.init())

  const swarm = new SwarmService()
  await safeInit('SwarmService', () => swarm.init())

  const mcp = new MCPService()
  await safeInit('MCPService', () => mcp.init())

  const eventRecorder = new EventRecorder()
  await safeInit('EventRecorder', () => eventRecorder.init())

  const bench = new BenchService()
  await safeInit('BenchService', () => bench.init())

  const graphService = new GraphService()
  await safeInit('GraphService', () => graphService.init())

  const guardService = new GuardService()
  await safeInit('GuardService', () => guardService.init())

  const voiceService = new VoiceService()
  await safeInit('VoiceService', () => voiceService.init())

  const linkService = new LinkService()
  await safeInit('LinkService', () => linkService.init())

  const syncService = new SyncService()
  await safeInit('SyncService', () => syncService.init())

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
    ...eventRecorder.getHandlers(),
    ...bench.getHandlers(),
    ...graphService.getHandlers(),
    ...guardService.getHandlers(),
    ...voiceService.getHandlers(),
    ...linkService.getHandlers(),
    ...syncService.getHandlers(),
  }
  router.registerAll(allHandlers)

  app.on('before-quit', () => {
    ptyManager.listSessions().forEach(id => {
      try { ptyManager.kill(id) } catch {}
    })
    try { linkService.shutdown() } catch {}
  })

  console.log('[bootstrap] opening main window')
  createMainWindow()

  // Broadcast service health to renderer once it loads
  const mainWin = WindowManager.getInstance().get('main')
  if (mainWin) {
    const broadcastHealth = () => {
      if (mainWin.isDestroyed()) return
      mainWin.webContents.send('app:serviceHealth', { failed: failedServices })
    }
    if (mainWin.webContents.isLoading()) {
      mainWin.webContents.once('did-finish-load', broadcastHealth)
    } else {
      broadcastHealth()
    }
  }

  // Register Edit menu for clipboard passthrough
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
    ])
  )

  setupAutoUpdater()
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
