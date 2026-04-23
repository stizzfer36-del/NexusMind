export const SERVICE_TOKENS = {
  DB: 'DB',
  Settings: 'Settings',
  Keychain: 'Keychain',
  ModelRouter: 'ModelRouter',
  PtyManager: 'PtyManager',
  KanbanService: 'KanbanService',
  SwarmService: 'SwarmService',
  MCPService: 'MCPService',
  MemoryService: 'MemoryService',
  VoiceService: 'VoiceService',
  BenchService: 'BenchService',
  GraphService: 'GraphService',
  EventRecorder: 'EventRecorder',
  GuardService: 'GuardService',
  LinkService: 'LinkService',
  SyncService: 'SyncService',
  FileService: 'FileService',
  ContextService: 'ContextService',
  GitService: Symbol('GitService'),
} as const

export class ServiceRegistry {
  private static instance: ServiceRegistry | null = null
  private readonly services = new Map<string | symbol, unknown>()
  private readonly lazyServices = new Map<string | symbol, () => unknown | Promise<unknown>>()

  private constructor() {}

  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry()
    }
    return ServiceRegistry.instance
  }

  register<T>(token: string | symbol, instance: T): void {
    this.services.set(token, instance)
  }

  registerLazy<T>(token: string | symbol, factory: () => T | Promise<T>): void {
    this.lazyServices.set(token, factory)
  }

  resolve<T>(token: string | symbol): T {
    if (!this.services.has(token)) {
      throw new Error(`Service not registered: ${String(token)}`)
    }
    return this.services.get(token) as T
  }

  async resolveLazy<T>(token: string | symbol): Promise<T> {
    if (this.services.has(token)) {
      return this.services.get(token) as T
    }
    if (!this.lazyServices.has(token)) {
      throw new Error(`Service not registered: ${String(token)}`)
    }
    const factory = this.lazyServices.get(token)!
    const instance = await factory()
    this.services.set(token, instance)
    return instance as T
  }

  has(token: string | symbol): boolean {
    return this.services.has(token) || this.lazyServices.has(token)
  }

  clear(): void {
    this.services.clear()
    this.lazyServices.clear()
  }
}
