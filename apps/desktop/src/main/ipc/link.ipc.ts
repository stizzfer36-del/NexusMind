import type { LinkService } from '../services/LinkService.js'
import type { LinkConfig } from '@nexusmind/shared'

export function createLinkIpcHandlers(
  service: LinkService
): Record<string, (event: any, ...args: any[]) => any> {
  return {
    'link:getConfig': (_event: any) => service.getConfig(),
    'link:setConfig': (_event: any, config: LinkConfig) => service.setConfig(config),
  }
}
