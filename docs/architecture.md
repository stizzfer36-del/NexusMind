# Architecture Overview

NexusMind follows a modular, service-oriented architecture designed for extensibility and reliability.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      RENDERER PROCESS                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  EditorPanel │  │  SwarmPanel │  │    MemoryPanel     │ │
│  │  (Monaco)    │  │  (Agents)   │  │  (NexusMemory)     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ BudgetPanel │  │  KanbanPanel│  │   GuardPanel       │ │
│  │ (Pricing)   │  │  (Tasks)    │  │   (Security)       │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                             │
│  State: Zustand stores (swarm, memory, kanban, etc.)       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ IPC
┌─────────────────────────────────────────────────────────────┐
│                        MAIN PROCESS                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              ServiceRegistry (DI)                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │SwarmSvc  │ │MemorySvc │ │KanbanSvc │ │  GuardSvc    │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │BudgetSvc │ │  FileSvc │ │  GitSvc  │ │   MCPSvc     │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │Model     │ │  BenchSvc│ │VoiceSvc  │ │   BenchSvc   │  │
│  │Router    │ │          │ │          │ │              │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│                                                             │
│  Database: SQLite (better-sqlite3) with WAL mode          │
└─────────────────────────────────────────────────────────────┘
```

## Key Architectural Decisions

### 1. ServiceRegistry (DI Container)
All services are registered in a central DI container, enabling:
- Loose coupling between components
- Easy testing with mock services
- Lazy initialization of heavy services

### 2. IPC Layer
Clean separation between main and renderer:
- Main process: Services, file system, native APIs
- Renderer: UI, state management, user interactions
- IPC: Type-safe channels with ~80 endpoints

### 3. Database Strategy
SQLite with WAL mode for:
- ACID compliance
- Zero configuration
- Fast reads (better-sqlite3 synchronous API)
- Small footprint

### 4. Multi-Provider LLM
ModelRouter supports:
- Anthropic (Claude)
- OpenAI (GPT-4o, etc.)
- Ollama (local models)
- OpenRouter (aggregator)

With automatic fallback and retry logic.

## Swarm Execution Flow

```
User Request
    │
    ▼
┌─────────────┐
│  Coordinator│──▶ Creates task plan
└─────────────┘
    │
    ▼
┌─────────────┐
│    Scout    │──▶ Maps repository
└─────────────┘
    │
    ▼
┌─────────────┐
│  Architect  │──▶ Creates implementation plan
└─────────────┘
    │
    ▼
┌─────────────┐
│   Builder   │──▶ Writes code
└─────────────┘
    │
    ▼
┌─────────────┐
│  Reviewer   │──▶ Reviews code
└─────────────┘
    │ (if rejected)
    └──────────▶ Back to Builder
    │ (if approved)
    ▼
┌─────────────┐
│   Tester    │──▶ Writes tests
└─────────────┘
    │
    ▼
┌─────────────┐
│  DocWriter  │──▶ Documentation
└─────────────┘
```

## Memory Architecture

NexusMemory uses a hybrid approach:

1. **TF-IDF** (pure JS, no dependencies)
   - Fast computation
   - Works offline
   - Good for exact keyword matching

2. **Vector Embeddings** (optional)
   - Semantic similarity
   - Better conceptual matching
   - Falls back to TF-IDF if unavailable

Storage: SQLite with JSON-encoded vectors

## Security Model

1. **Workspace Isolation**: All file operations restricted to workspace root
2. **File Locking**: Prevents concurrent agent modifications
3. **Approval Gates**: GuardService blocks actions with critical findings
4. **Sandbox**: MCP tools run with restricted permissions

## Extensibility

### MCP (Model Context Protocol)
NexusMind exposes services via MCP:
- `nexusmind_memory`: Query/store memories
- `nexusmind_guard`: Security scanning
- `nexusmind_kanban`: Task management
- Custom MCP servers via stdio/SSE

### Plugin Architecture (Future)
Planned 6-layer plugin system:
1. MCP Servers
2. Agent Skills
3. Hooks (pre/post actions)
4. Custom Subagents
5. Agent SDK

## Performance Considerations

1. **Lazy Loading**: Services initialized on first use
2. **Virtualization**: Long lists use windowing
3. **Debouncing**: Search inputs debounced 300ms
4. **Streaming**: LLM responses stream in real-time
5. **Caching**: Model configs and file trees cached

## Testing Strategy

- Unit: Vitest for service logic
- Integration: Playwright for E2E
- Benchmarks: BenchService for model evaluation
