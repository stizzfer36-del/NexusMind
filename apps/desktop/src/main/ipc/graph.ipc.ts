import type { GraphService } from '../services/graph/GraphService.js'
import type { WorkflowDAG, WorkflowRunRequest } from '@nexusmind/shared'

export function createGraphIpcHandlers(
  service: GraphService
): Record<string, (event: any, ...args: any[]) => any> {
  return {
    'graph:list': (_event: any) => service.list(),
    'graph:load': (_event: any, dagId: string) => service.load(dagId),
    'graph:save': (_event: any, dag: WorkflowDAG) => service.save(dag),
    'graph:delete': (_event: any, dagId: string) => service.delete(dagId),
    'graph:templates': (_event: any) => service.getTemplates(),
    'graph:execute': (_event: any, payload: WorkflowRunRequest) =>
      service.execute(payload.dagId, payload.input),
  }
}
