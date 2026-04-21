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

  // swarm
  'swarm:start': stub,
  'swarm:stop': stub,
  'swarm:getState': stub,

  // kanban / tasks
  'kanban:createTask': stub,
  'kanban:updateTask': stub,
  'kanban:deleteTask': stub,
  'kanban:moveTask': stub,

  // models
  'models:list': stub,
  'models:getConfig': stub,
  'models:streamChat': stub,

  // settings
  'settings:get': stub,
  'settings:set': stub,

  // mcp
  'mcp:listTools': stub,
  'mcp:callTool': stub,
  'mcp:addServer': stub,
  'mcp:removeServer': stub,

  // memory
  'memory:search': stub,
  'memory:add': stub,

  // voice
  'voice:start': stub,
  'voice:stop': stub,
  'voice:tts': stub,

  // graph
  'graph:get': stub,
  'graph:save': stub,

  // replay
  'replay:get': stub,

  // guard
  'guard:scan': stub,

  // bench
  'bench:run': stub,
  'bench:getReport': stub,
}
