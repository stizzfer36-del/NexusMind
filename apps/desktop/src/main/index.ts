import { app, Menu, dialog, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { WindowManager } from './windows/WindowManager.js'
import { createMainWindow } from './windows/MainWindow.js'
import { IPCRouter } from './ipc/IPCRouter.js'
import { channels } from './ipc/channels.js'
import { createModelIpcHandlers } from './ipc/model.ipc.js'
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
import { FileService } from './services/FileService.js'
import { ContextService } from './services/ContextService.js'
import { ServiceRegistry, SERVICE_TOKENS } from './ServiceRegistry.js'

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
  const crashLogDir = path.join(os.homedir(), '.nexusmind')
  const crashLogPath = path.join(crashLogDir, 'crash.log')

  function logToCrash(message: string): void {
    try {
      if (!fs.existsSync(crashLogDir)) {
        fs.mkdirSync(crashLogDir, { recursive: true })
      }
      fs.appendFileSync(crashLogPath, `[updater] ${new Date().toISOString()} ${message}\n`, 'utf8')
    } catch {
      // ignore logging errors
    }
  }

  function pushToRenderer(channel: string, payload: unknown): void {
    const win = WindowManager.getInstance().get('main')
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] Update available:', info.version)
    logToCrash(`update-available: ${info.version}`)
    pushToRenderer('updater:available', {
      version: info.version,
      releaseNotes: info.releaseNotes ?? undefined,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] Update downloaded:', info.version)
    logToCrash(`update-downloaded: ${info.version}`)
    pushToRenderer('updater:ready', { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message)
    logToCrash(`error: ${err.message}`)
    pushToRenderer('updater:error', { message: err.message })
  })

  ipcMain.handle('updater:install', () => {
    console.log('[updater] Quit and install triggered')
    autoUpdater.quitAndInstall()
  })

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[updater] checkForUpdatesAndNotify failed:', err.message)
      logToCrash(`checkForUpdatesAndNotify failed: ${err.message}`)
    })
  }
}

async function initLazyServices(): Promise<void> {
  const registry = ServiceRegistry.getInstance()
  await safeInit('EventRecorder', async () => {
    await registry.resolveLazy(SERVICE_TOKENS.EventRecorder)
  })
  await safeInit('BenchService', async () => {
    await registry.resolveLazy(SERVICE_TOKENS.BenchService)
  })
  await safeInit('VoiceService', async () => {
    await registry.resolveLazy(SERVICE_TOKENS.VoiceService)
  })
  await safeInit('SyncService', async () => {
    await registry.resolveLazy(SERVICE_TOKENS.SyncService)
  })
}

async function bootstrap(): Promise<void> {
  const registry = ServiceRegistry.getInstance()

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

  const mcp = new MCPService(memory)
  await safeInit('MCPService', () => mcp.init())

  const eventRecorder = new EventRecorder()
  registry.registerLazy(SERVICE_TOKENS.EventRecorder, async () => {
    await eventRecorder.init()
    return eventRecorder
  })

  const bench = new BenchService()
  registry.registerLazy(SERVICE_TOKENS.BenchService, async () => {
    await bench.init()
    return bench
  })

  const graphService = new GraphService()
  await safeInit('GraphService', () => graphService.init())

  const guardService = new GuardService()
  await safeInit('GuardService', () => guardService.init())

  const voiceService = new VoiceService()
  registry.registerLazy(SERVICE_TOKENS.VoiceService, async () => {
    await voiceService.init()
    return voiceService
  })

  const linkService = new LinkService()
  await safeInit('LinkService', () => linkService.init())

  const syncService = new SyncService()
  registry.registerLazy(SERVICE_TOKENS.SyncService, async () => {
    await syncService.init()
    return syncService
  })

  const fileService = new FileService()
  await safeInit('FileService', () => fileService.init())

  const contextService = new ContextService()
  await safeInit('ContextService', () => contextService.init())

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
    ...fileService.getHandlers(),
    ...contextService.getHandlers(),
    ...createModelIpcHandlers(modelRouter),
  }
  router.registerAll(allHandlers)

  // Persist renderer crash reports to ~/.nexusmind/crash.log
  const crashLogDir = path.join(os.homedir(), '.nexusmind')
  const crashLogPath = path.join(crashLogDir, 'crash.log')
  ipcMain.on('app:rendererCrash', (_event, payload) => {
    try {
      if (!fs.existsSync(crashLogDir)) {
        fs.mkdirSync(crashLogDir, { recursive: true })
      }
      const entry = [
        `--- Renderer Crash ---`,
        `Timestamp: ${new Date(payload.timestamp).toISOString()}`,
        `Panel: ${payload.panelName ?? 'unknown'}`,
        `Message: ${payload.message}`,
        payload.stack ? `Stack:\n${payload.stack}` : '',
        payload.componentStack ? `Component Stack:\n${payload.componentStack}` : '',
        '',
      ].join('\n')
      fs.appendFileSync(crashLogPath, entry, 'utf8')
      console.error('[main] Renderer crash logged to', crashLogPath)
    } catch (err) {
      console.error('[main] Failed to write crash log:', err)
    }
  })

  app.on('before-quit', () => {
    ptyManager.listSessions().forEach(id => {
      try { ptyManager.kill(id) } catch {}
    })
    try { linkService.shutdown() } catch {}
  })

  console.log('[bootstrap] opening main window')
  createMainWindow()

  // Broadcast service health to renderer once it loads, and init lazy services
  const mainWin = WindowManager.getInstance().get('main')
  if (mainWin) {
    const onDidFinishLoad = async () => {
      if (mainWin.isDestroyed()) return
      await initLazyServices()
      mainWin.webContents.send('app:serviceHealth', { failed: failedServices })
    }
    if (mainWin.webContents.isLoading()) {
      mainWin.webContents.once('did-finish-load', () => {
        onDidFinishLoad().catch(console.error)
      })
    } else {
      onDidFinishLoad().catch(console.error)
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
