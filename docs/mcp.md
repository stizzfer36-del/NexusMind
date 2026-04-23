# NexusMind MCP Integration

NexusMind exposes all internal services via the Model Context Protocol (MCP), making it the infrastructure layer for any AI editor — including Cursor, Claude Code, Windsurf, and more.

## Why MCP?

MCP (Model Context Protocol) is an open standard that allows AI tools to discover and use external capabilities. By exposing NexusMind's services via MCP, you can:

- Use **NexusMemory** from Cursor for persistent memory
- Run **NexusGuard** security scans from Claude Code
- Query your **codebase index** from any MCP-compatible tool
- Manage **kanban tasks** and **budget** across all your AI workflows

## Exposed Services

### NexusMemory
- `nexusmind_memory_search` — Search persistent memory
- `nexusmind_memory_store` — Store new memories

### NexusGuard
- `nexusmind_guard_scan` — Run security scans
- `nexusmind_guard_get_findings` — Get scan results

### Kanban
- `nexusmind_kanban_create_task` — Create tasks
- `nexusmind_kanban_list_tasks` — List tasks

### Budget
- `nexusmind_budget_check` — Check spend against limits
- `nexusmind_budget_get_config` — Get budget limits

### Codebase Index
- `nexusmind_codebase_search` — Semantic search
- `nexusmind_codebase_index` — Re-index codebase

## Connecting Cursor to NexusMind

### Step 1: Get MCP Configuration

In NexusMind, go to **Settings → MCP** and copy the configuration:

```json
{
  "mcpServers": {
    "nexusmind": {
      "command": "node",
      "args": ["/path/to/nexusmind/mcp-server.js"],
      "env": {
        "NEXUSMIND_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Step 2: Configure Cursor

1. Open Cursor Settings (Cmd/Ctrl + ,)
2. Navigate to **Features → MCP**
3. Click **Edit Config**
4. Paste the JSON configuration
5. Restart Cursor

### Step 3: Use NexusMind Tools

In Cursor's AI chat, you can now use:

```
@nexusmind_memory_search query="authentication patterns"
@nexusmind_guard_scan path="./src"
@nexusmind_codebase_search query="database connection"
```

## Connecting Claude Code

Add to your Claude Code configuration:

```bash
claude config add mcp nexusmind npx -y @nexusmind/mcp-server
```

Then use in Claude Code:

```
/nexusmind_memory_search "API error handling patterns"
```

## Tool Schema

### nexusmind_memory_search
```json
{
  "name": "nexusmind_memory_search",
  "description": "Search persistent memory across all sessions",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "limit": { "type": "number" },
      "type": { "type": "string", "enum": ["episodic", "semantic", "procedural", "working"] }
    },
    "required": ["query"]
  }
}
```

### nexusmind_guard_scan
```json
{
  "name": "nexusmind_guard_scan",
  "description": "Run security scan (semgrep, npm audit, trufflehog)",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" }
    }
  }
}
```

## Architecture

```
┌─────────────┐     MCP      ┌──────────────┐
│   Cursor    │◀────────────▶│  NexusMind   │
│  Claude Code│              │   MCP Server │
│   Windsurf  │              └──────┬───────┘
└─────────────┘                     │
                                    ▼
                           ┌────────────────┐
                           │ NexusMemory    │
                           │ NexusGuard     │
                           │ KanbanService  │
                           │ BudgetService  │
                           │ CodebaseIndex  │
                           └────────────────┘
```

## Security

- API keys required for MCP access
- Workspace-scoped permissions
- Audit logging of all MCP calls
- No code execution via MCP (read-only operations)

## Extending

To add a new MCP tool:

1. Add tool definition in `MCPService.exposeServiceTools()`
2. Add handler in `MCPService.executeTool()`
3. Document in this file

## Troubleshooting

**"MCP server not found"**
- Verify NexusMind is running
- Check API key is correct
- Restart your editor

**"Tool execution failed"**
- Check service is initialized
- Review NexusMind logs
- Verify workspace path is accessible

## References

- [MCP Specification](https://modelcontextprotocol.io/)
- [Cursor MCP Docs](https://cursor.com/docs/mcp)
- [NexusMind Architecture](../architecture.md)
