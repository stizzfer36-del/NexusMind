import { ipcMain, IpcMainInvokeEvent } from 'electron'

const ALLOWED_CHANNELS: string[] = [
  // terminal / pty
  'terminal:spawn',
  'terminal:write',
  'terminal:resize',
  'terminal:kill',
  'pty:create',
  'pty:write',
  'pty:resize',
  'pty:close',

  // swarm
  'swarm:create',
  'swarm:listSessions',
  'swarm:start',
  'swarm:stop',
  'swarm:getState',
  'swarm:getAgents',

  // kanban / tasks
  'kanban:listTasks',
  'kanban:getTasks',
  'kanban:createTask',
  'kanban:updateTask',
  'kanban:deleteTask',
  'kanban:moveTask',

  // models
  'models:list',
  'models:getConfig',
  'models:streamChat',
  'model:validate',
  'model:stream',

  // settings
  'settings:get',
  'settings:set',

  // keychain
  'keychain:set',
  'keychain:get',
  'keychain:delete',
  'keychain:list',

  // mcp
  'mcp:listTools',
  'mcp:callTool',
  'mcp:addServer',
  'mcp:removeServer',
  'mcp:executeTool',
  'mcp:getServerStatus',

  // memory
  'memory:list',
  'memory:search',
  'memory:add',
  'memory:delete',

  // voice
  'voice:getConfig',
  'voice:setConfig',
  'voice:startSession',
  'voice:getSession',
  'voice:listSessions',
  'voice:transcribeChunk',
  'voice:speakText',

  // graph
  'graph:list',
  'graph:load',
  'graph:save',
  'graph:delete',
  'graph:templates',
  'graph:execute',

  // replay
  'replay:get',
  'replay:getSessions',
  'replay:getEvents',
  'replay:deleteSession',

  // guard
  'guard:run',
  'guard:getRun',
  'guard:listRuns',
  'guard:getFindings',
  'guard:getPolicy',
  'guard:setPolicy',
  'guard:approvalResponse',

  // bench
  'bench:listTasks',
  'bench:listModels',
  'bench:runTask',
  'bench:runBatch',
  'bench:listRuns',

  // link
  'link:getConfig',
  'link:setConfig',

  // sync
  'sync:getConfig',
  'sync:setConfig',
  'sync:getSummary',
  'sync:trigger',

  // dialog
  'dialog:openDirectory',

  // context
  'context:setActiveFile',
  'context:getActiveFile',
  'context:getSystemContext',

  // file
  'file:read',
  'file:write',
  'file:listDir',
  'file:applyDiff',
  'file:watch',
  'file:unwatch',

  // renderer push events (Main → Renderer, also valid on ipcMain)
  'terminal:data',
  'terminal:exit',
  'pty:data',
  'pty:exit',
  'swarm:update',
  'swarm:message',
  'swarm:sessionCreated',
  'kanban:taskUpdated',
  'models:status',
  'settings:changed',
  'mcp:toolResult',
  'mcp:serverStatus',
  'mcp:serverDown',
  'mcp:serverUp',
  'memory:entryAdded',
  'voice:transcript',
  'voice:stateChange',
  'voice:audioReady',
  'graph:updated',
  'workflow:stepComplete',
  'replay:event',
  'guard:finding',
  'guard:progress',
  'guard:complete',
  'guard:requestApproval',
  'bench:progress',
  'link:statusChange',
  'sync:statusChange',
  'stream:data',
  'stream:end',
  'model:token',
  'model:done',
  'model:error',
  'file:watchEvent',
  'app:serviceHealth',
  'app:rendererCrash',
]

type InvokeHandler = (event: IpcMainInvokeEvent, ...args: any[]) => any

type PushHandler = (event: Electron.IpcMainEvent, ...args: any[]) => void

export class IPCRouter {
  private readonly registeredChannels = new Set<string>()

  register(channel: string, handler: InvokeHandler): void {
    const wrapped: InvokeHandler = (event, ...args) => {
      if (!event.senderFrame?.url?.startsWith('file://')) {
        return { error: 'unauthorized sender' }
      }
      return handler(event, ...args)
    }
    ipcMain.handle(channel, wrapped)
    this.registeredChannels.add(channel)
  }

  registerPush(channel: string, handler: PushHandler): void {
    const wrapped: PushHandler = (event, ...args) => {
      if (!event.senderFrame?.url?.startsWith('file://')) {
        return
      }
      return handler(event, ...args)
    }
    ipcMain.on(channel, wrapped)
    this.registeredChannels.add(channel)
  }

  registerAll(handlers: Record<string, InvokeHandler>): void {
    for (const [channel, handler] of Object.entries(handlers)) {
      if (!ALLOWED_CHANNELS.includes(channel)) {
        const err = new Error(`[IPCRouter] Channel "${channel}" is not in ALLOWED_CHANNELS`)
        console.error(err)
        throw err
      }
      this.register(channel, handler)
    }
  }

  dispose(): void {
    for (const channel of this.registeredChannels) {
      try {
        ipcMain.removeHandler(channel)
      } catch {
        // no invoke handler to remove
      }
      ipcMain.removeAllListeners(channel)
    }
    this.registeredChannels.clear()
  }
}
