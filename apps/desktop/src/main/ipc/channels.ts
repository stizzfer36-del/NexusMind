import type { IpcEvents } from '@nexusmind/shared/ipc-channels'
import type { IpcMainInvokeEvent } from 'electron'

type HandlerMap = {
  [K in keyof IpcEvents]: (
    event: IpcMainInvokeEvent,
    ...args: Parameters<IpcEvents[K]>
  ) => ReturnType<IpcEvents[K]> | Promise<ReturnType<IpcEvents[K]>>
}

const stub = () => ({ ok: false, error: 'not implemented' } as any)

export const channels: HandlerMap = {
  // terminal / pty
  'terminal:spawn': stub,
  'terminal:write': stub,
  'terminal:resize': stub,
  'terminal:kill': stub,
  'pty:create': stub,
  'pty:write': stub,
  'pty:resize': stub,
  'pty:close': stub,

  // swarm
  'swarm:create': stub,
  'swarm:listSessions': stub,
  'swarm:start': stub,
  'swarm:stop': stub,
  'swarm:getState': stub,
  'swarm:getAgents': stub,

  // kanban / tasks
  'kanban:listTasks': stub,
  'kanban:getTasks': stub,
  'kanban:createTask': stub,
  'kanban:updateTask': stub,
  'kanban:deleteTask': stub,
  'kanban:moveTask': stub,

  // models
  'models:list': stub,
  'models:getConfig': stub,
  'models:streamChat': stub,
  'model:validate': stub,
  'model:stream': stub,

  // settings
  'settings:get': stub,
  'settings:set': stub,

  // keychain
  'keychain:set': stub,
  'keychain:get': stub,
  'keychain:delete': stub,
  'keychain:list': stub,

  // mcp
  'mcp:listTools': stub,
  'mcp:callTool': stub,
  'mcp:addServer': stub,
  'mcp:removeServer': stub,
  'mcp:executeTool': stub,
  'mcp:getServerStatus': stub,

  // memory
  'memory:list': stub,
  'memory:search': stub,
  'memory:add': stub,
  'memory:delete': stub,

  // voice
  'voice:getConfig': stub,
  'voice:setConfig': stub,
  'voice:startSession': stub,
  'voice:getSession': stub,
  'voice:listSessions': stub,
  'voice:transcribeChunk': stub,
  'voice:speakText': stub,

  // graph
  'graph:list': stub,
  'graph:load': stub,
  'graph:save': stub,
  'graph:delete': stub,
  'graph:templates': stub,
  'graph:execute': stub,

  // replay
  'replay:get': stub,
  'replay:getSessions': stub,
  'replay:getEvents': stub,
  'replay:deleteSession': stub,

  // guard
  'guard:run': stub,
  'guard:getRun': stub,
  'guard:listRuns': stub,
  'guard:getFindings': stub,
  'guard:getPolicy': stub,
  'guard:setPolicy': stub,
  'guard:approvalResponse': stub,

  // bench
  'bench:listTasks': stub,
  'bench:listModels': stub,
  'bench:runTask': stub,
  'bench:runBatch': stub,
  'bench:listRuns': stub,

  // link
  'link:getConfig': stub,
  'link:setConfig': stub,

  // sync
  'sync:getConfig': stub,
  'sync:setConfig': stub,
  'sync:getSummary': stub,
  'sync:trigger': stub,

  // dialog
  'dialog:openDirectory': stub,

  // context
  'context:setActiveFile': stub,
  'context:getActiveFile': stub,
  'context:getSystemContext': stub,
}
