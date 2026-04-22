import type { GuardService } from '../services/GuardService.js'
import type { GuardPolicy } from '@nexusmind/shared'

export function createGuardIpcHandlers(
  service: GuardService
): Record<string, (event: any, ...args: any[]) => any> {
  return {
    'guard:run': async (_event: any) => service.runGuard(),
    'guard:getRun': (_event: any, runId: string) => service.getRun(runId),
    'guard:listRuns': (_event: any) => service.listRuns(),
    'guard:getFindings': (_event: any, runId: string) => service.getFindings(runId),
    'guard:getPolicy': (_event: any) => service.getPolicy(),
    'guard:setPolicy': (_event: any, policy: GuardPolicy) => service.setPolicy(policy),
  }
}
