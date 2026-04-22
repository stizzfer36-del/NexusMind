# NexusMind

NexusMind is an intelligent desktop application built with Electron 33, React 19, and TypeScript 5.5, designed to deliver a modern, high-performance user experience through a pnpm monorepo architecture powered by electron-vite.

## NexusCode CLI

The `nexus` CLI lets you run NexusMind agent swarms, benchmarks, security scans, and workflow graphs directly from your terminal.

### Setup

```bash
pnpm install
pnpm --filter @nexusmind/cli run build
```

Set your API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### Commands

```bash
# Run an AI agent swarm on a goal
node packages/cli/dist/bin/nexus.js run-swarm --goal "Implement a REST endpoint for user authentication"

# Run all agents (up to 5) for more thorough analysis
node packages/cli/dist/bin/nexus.js run-swarm --goal "Build a file upload service" --maxAgents 5

# Execute a saved workflow DAG (requires NexusMind desktop app for DAG creation)
node packages/cli/dist/bin/nexus.js run-graph --dagId my-workflow --input "Build login feature"

# Run benchmark tasks to evaluate model quality
node packages/cli/dist/bin/nexus.js run-bench --dimension reasoning --sampleSize 3

# Run security guard scan on the current project
node packages/cli/dist/bin/nexus.js run-guard

# Start interactive REPL
node packages/cli/dist/bin/nexus.js repl
```

### REPL mode

The REPL lets you run multiple commands interactively:

```
⚡ NexusMind REPL
   Type "help" for commands, "exit" to quit.

nexus> swarm Add pagination to the users API
nexus> bench quality
nexus> guard
nexus> exit
```

### Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key for LLM-powered commands |
| `NEXUS_DB_PATH` | Path to NexusMind SQLite database (for `run-graph`) |
