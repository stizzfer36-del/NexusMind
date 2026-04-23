#!/usr/bin/env node

import type { SwarmRunArgs, GraphRunArgs, BenchRunArgs, GuardRunArgs } from '@nexusmind/shared'
import { runSwarm, runGraph, runBench, runGuard, startRepl, openNexusMind, getVersion } from '../src/NexusCliRunner'

function printHelp(): void {
  console.log(`
NexusMind CLI

Usage: nexus <command> [options]

Commands:
  run-swarm    Run an AI agent swarm on a goal
  run-graph    Execute a saved workflow DAG
  run-bench    Run benchmark tasks against a model
  run-guard    Run security guard scan
  nexusmind    Open NexusMind desktop app at a path
  repl         Start interactive REPL
  help         Show this help

Options for run-swarm:
  --goal <text>         Goal for the swarm (required)
  --maxAgents <n>       Max agents to use (default: 3)
  --maxRounds <n>       Max rounds (default: 1)

Options for run-graph:
  --dagId <id>          DAG ID to execute (required)
  --input <text>        Input for the workflow

Options for run-bench:
  --dimension <name>    Benchmark dimension (quality|speed|cost|reasoning)
  --modelId <id>        Model to benchmark
  --sampleSize <n>      Number of tasks (default: 3)

Options for nexusmind:
  <path>                Directory to open (default: .)
  --version             Print version and exit

Environment variables:
  ANTHROPIC_API_KEY     API key for LLM calls
  NEXUS_DB_PATH         Path to NexusMind SQLite database
`)
}

function parseArgs(argv: string[]): { command: string; flags: Record<string, string | number | boolean>; positional: string[] } {
  const command = argv[0] ?? ''
  const flags: Record<string, string | number | boolean> = {}
  const positional: string[] = []

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const key = arg.slice(2)
    const valueParts: string[] = []
    let j = i + 1
    while (j < argv.length && !argv[j].startsWith('--')) {
      valueParts.push(argv[j])
      j++
    }
    if (valueParts.length === 0) {
      flags[key] = true
    } else if (valueParts.length === 1 && !isNaN(Number(valueParts[0]))) {
      flags[key] = Number(valueParts[0])
    } else {
      flags[key] = valueParts.join(' ')
    }
    i = j - 1
  }

  return { command, flags, positional }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    printHelp()
    return
  }

  if (argv[0] === '--version' || argv[0] === '-v') {
    console.log(getVersion())
    return
  }

  const { command, flags, positional } = parseArgs(argv)

  if (flags.version) {
    console.log(getVersion())
    return
  }

  switch (command) {
    case 'run-swarm': {
      if (!flags.goal) {
        console.error('Error: --goal is required for run-swarm')
        process.exit(1)
      }
      const args: SwarmRunArgs = {
        goal: String(flags.goal),
        maxAgents: flags.maxAgents != null ? Number(flags.maxAgents) : 3,
        maxRounds: flags.maxRounds != null ? Number(flags.maxRounds) : 1,
      }
      const result = await runSwarm(args)
      if (!result.ok) {
        console.error('Error:', result.message)
        process.exit(1)
      }
      break
    }

    case 'run-graph': {
      if (!flags.dagId) {
        console.error('Error: --dagId is required for run-graph')
        process.exit(1)
      }
      const args: GraphRunArgs = {
        dagId: String(flags.dagId),
        input: flags.input != null ? String(flags.input) : undefined,
      }
      const result = await runGraph(args)
      if (!result.ok) {
        console.error('Error:', result.message)
        process.exit(1)
      }
      break
    }

    case 'run-bench': {
      const args: BenchRunArgs = {
        dimension: flags.dimension != null ? String(flags.dimension) : undefined,
        modelId: flags.modelId != null ? String(flags.modelId) : undefined,
        sampleSize: flags.sampleSize != null ? Number(flags.sampleSize) : 3,
      }
      const result = await runBench(args)
      if (!result.ok) {
        console.error('Error:', result.message)
        process.exit(1)
      }
      break
    }

    case 'run-guard': {
      const result = await runGuard({})
      if (!result.ok) {
        console.error('Error:', result.message)
        process.exit(1)
      }
      break
    }

    case 'nexusmind': {
      const targetPath = positional[0] ?? '.'
      openNexusMind(targetPath)
      break
    }

    case 'repl':
      await startRepl()
      break

    case 'help':
    default:
      printHelp()
      break
  }
}

main().catch(err => {
  console.error('Fatal error:', String(err))
  process.exit(1)
})
