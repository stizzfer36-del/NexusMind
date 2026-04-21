import keytar from 'keytar'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'

const SERVICE_NAME = 'NexusMind'

export class KeychainService {
  async init(): Promise<void> {
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.Keychain, this)
  }

  async setApiKey(provider: string, key: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, provider, key)
  }

  async getApiKey(provider: string): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, provider)
  }

  async deleteApiKey(provider: string): Promise<void> {
    await keytar.deletePassword(SERVICE_NAME, provider)
  }

  async listProviders(): Promise<string[]> {
    const credentials = await keytar.findCredentials(SERVICE_NAME)
    return credentials.map((c) => c.account)
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'keychain:set': (event: any, provider: string, key: string) =>
        this.setApiKey(provider, key),
      'keychain:get': (event: any, provider: string) =>
        this.getApiKey(provider),
      'keychain:delete': (event: any, provider: string) =>
        this.deleteApiKey(provider),
      'keychain:list': () => this.listProviders(),
    }
  }
}
