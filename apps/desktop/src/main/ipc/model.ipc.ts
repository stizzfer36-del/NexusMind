import type { IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'crypto'
import type { ModelRouter } from '../services/ModelRouter.js'
import type { ModelId } from '@nexusmind/shared'

export function createModelIpcHandlers(modelRouter: ModelRouter) {
  return {
    'model:stream': async (
      event: IpcMainInvokeEvent,
      payload: { modelId: ModelId; messages: Array<{ role: string; content: string }> },
    ) => {
      const streamId = randomUUID()

      const modelConfig = modelRouter.getKnownModels().find((m) => m.id === payload.modelId)
      if (!modelConfig) {
        const error = `Unknown model: ${payload.modelId}`
        event.sender.send('model:error', { streamId, error })
        return { streamId, ok: false, error }
      }

      // Fire-and-forget the actual token stream
      ;(async () => {
        try {
          for await (const chunk of modelRouter.streamChat(payload.modelId, payload.messages)) {
            if (chunk.isDone) {
              event.sender.send('model:done', {
                streamId,
                finishReason: chunk.finishReason,
                usage: chunk.usage,
              })
              break
            }
            event.sender.send('model:token', {
              streamId,
              token: chunk.content,
              index: chunk.index,
            })
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          event.sender.send('model:error', { streamId, error })
        }
      })()

      return { streamId, ok: true }
    },
  }
}
