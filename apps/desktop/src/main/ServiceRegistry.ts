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
} as const

export class ServiceRegistry {
  private static instance: ServiceRegistry | null = null
  private readonly services = new Map<string, unknown>()

  private constructor() {}

  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry()
    }
    return ServiceRegistry.instance
  }

  register<T>(token: string, instance: T): void {
    this.services.set(token, instance)
  }

  resolve<T>(token: string): T {
    if (!this.services.has(token)) {
      throw new Error(`Service not registered: ${token}`)
    }
    return this.services.get(token) as T
  }

  has(token: string): boolean {
    return this.services.has(token)
  }

  clear(): void {
    this.services.clear()
  }
}
