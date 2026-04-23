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
    'guard:approvalResponse': (_event: any, payload: { requestId: string; approved: boolean }) =>
      service.resolveApproval(payload.requestId, payload.approved),
    'guard:getSecurityScore': (_event: any) => service.getSecurityScore(),
    'guard:getTrends': (_event: any) => service.getTrends(),
    'guard:exportSarif': (_event: any, runId?: string) => service.exportSarif(runId),
    'guard:fixSuggestion': async (_event: any, findingId: string) => service.getFixSuggestion(findingId),
    'guard:scanFile': async (_event: any, filePath: string) => service.scanFile(filePath),
    'guard:preCommitCheck': async (_event: any) => service.preCommitCheck(),
  }
}
