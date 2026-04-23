import { execSync, spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { SwarmRunArgs, GraphRunArgs, BenchRunArgs, GuardRunArgs, CLIResult } from '@nexusmind/shared'

// ─── LLM Helper ──────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

async function callLLM(systemPrompt: string, userMessage: string, model = DEFAULT_MODEL): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.NEXUS_API_KEY
  if (!apiKey) {
    return '[No ANTHROPIC_API_KEY set — LLM call skipped. Set ANTHROPIC_API_KEY to enable AI features.]'
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 200)}`)
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> }
  return data.content.find(c => c.type === 'text')?.text ?? ''
}

// ─── run-swarm ────────────────────────────────────────────────────────────────

const ROLE_PROMPTS: Record<string, string> = {
  coordinator: 'You are the coordinator agent. Analyze the task and produce a clear, actionable implementation plan.',
  builder:     'You are the builder agent. Write clean, working code to implement the described task.',
  reviewer:    'You are the reviewer agent. Review the output for correctness and suggest improvements.',
  tester:      'You are the tester agent. Write tests or describe how to verify the feature.',
  docwriter:   'You are the docwriter agent. Write clear documentation for the described task.',
}

export async function runSwarm(args: SwarmRunArgs): Promise<CLIResult> {
  const { goal, maxAgents = 3, maxRounds = 1 } = args
  const roles = ['coordinator', 'builder', 'reviewer', 'tester', 'docwriter'].slice(0, maxAgents)

  console.log(`\n🐝 Starting swarm`)
  console.log(`   Goal: "${goal}"`)
  console.log(`   Agents: ${roles.join(', ')}`)
  console.log(`   Rounds: ${maxRounds}\n`)

  const outputs: Record<string, string> = {}
  let context = `Goal: ${goal}`

  for (let round = 0; round < maxRounds; round++) {
    if (maxRounds > 1) console.log(`\n── Round ${round + 1} ──`)
    for (const role of roles) {
      process.stdout.write(`  [${role.toUpperCase()}] thinking...`)
      try {
        const result = await callLLM(ROLE_PROMPTS[role], context)
        outputs[role] = result
        console.log(' done')
        const preview = result.length > 400 ? result.slice(0, 400) + '...' : result
        console.log(`\n${preview}\n`)
        context = `${context}\n\n[${role} said]:\n${result}`
      } catch (err) {
        console.log(` error: ${String(err)}`)
      }
    }
  }

  const finalOutput = outputs.docwriter ?? outputs[roles[roles.length - 1]] ?? 'No output generated'
  console.log('\n✅ Swarm complete')
  return { ok: true, message: finalOutput, data: outputs }
}

// ─── run-graph ────────────────────────────────────────────────────────────────

function defaultDbPath(): string {
  const platform = process.platform
  if (platform === 'linux') return path.join(os.homedir(), '.config', 'NexusMind', 'nexusmind.db')
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'NexusMind', 'nexusmind.db')
  return path.join(os.homedir(), 'AppData', 'Roaming', 'NexusMind', 'nexusmind.db')
}

export async function runGraph(args: GraphRunArgs): Promise<CLIResult> {
  const { dagId, input } = args
  const dbPath = process.env.NEXUS_DB_PATH ?? defaultDbPath()

  console.log(`\n🔀 Graph execution`)
  console.log(`   DAG: "${dagId}"`)
  if (input) console.log(`   Input: "${input}"`)
  console.log()

  let Database: any
  try {
    Database = require('better-sqlite3')
  } catch {
    const hint = `Set NEXUS_DB_PATH to your NexusMind database, e.g.:\n  NEXUS_DB_PATH=~/.config/NexusMind/nexusmind.db nexus run-graph --dagId ${dagId}`
    console.log(`Note: better-sqlite3 not available in CLI context.\n${hint}`)
    return { ok: false, message: 'better-sqlite3 not available' }
  }

  let db: any
  try {
    db = new Database(dbPath, { readonly: true })
  } catch (err) {
    console.log(`Could not open database at: ${dbPath}`)
    console.log(`Set NEXUS_DB_PATH env var to point to your NexusMind database.`)
    return { ok: false, message: `Database not found: ${dbPath}` }
  }

  const row = db.prepare('SELECT * FROM workflow_graphs WHERE id = ?').get(dagId) as any
  db.close()

  if (!row) {
    return { ok: false, message: `DAG "${dagId}" not found in database. Create it in the NexusMind desktop app first.` }
  }

  const dag = JSON.parse(row.dag_json) as {
    name: string
    nodes: Array<{ id: string; type: string; label: string; config?: Record<string, unknown> }>
    edges: Array<{ source: string; target: string }>
  }

  const runId = Date.now().toString(36)
  console.log(`Executing: ${dag.name}`)
  console.log(`Nodes: ${dag.nodes.length}, Edges: ${dag.edges.length}\n`)

  for (const node of dag.nodes) {
    if (node.type === 'agent' && node.config?.role) {
      const role = String(node.config.role)
      process.stdout.write(`  [${role.toUpperCase()}] executing...`)
      try {
        const result = await callLLM(
          ROLE_PROMPTS[role] ?? `You are the ${role} agent. Complete your task.`,
          input ?? `Execute your role (${role}) in this workflow.`
        )
        console.log(' done')
        const preview = result.length > 200 ? result.slice(0, 200) + '...' : result
        console.log(`  → ${preview}\n`)
      } catch (err) {
        console.log(` error: ${String(err)}`)
      }
    } else if (node.type === 'tool') {
      console.log(`  [TOOL] ${node.label} (skipped in CLI mode)`)
    } else if (node.type === 'start' || node.type === 'end') {
      console.log(`  [${node.type.toUpperCase()}]`)
    }
  }

  console.log(`\n✅ Graph run complete: ${runId}`)
  return { ok: true, message: `Run ${runId} completed`, data: { runId, dagName: dag.name } }
}

// ─── run-bench ────────────────────────────────────────────────────────────────

const SAMPLE_TASKS = [
  { id: 'b1', name: 'Fibonacci', dimension: 'quality',   input: 'Write a Python function that returns the nth Fibonacci number using dynamic programming.' },
  { id: 'b2', name: 'Sort logic', dimension: 'reasoning', input: 'Explain why quicksort has O(n log n) average time complexity but O(n²) worst case.' },
  { id: 'b3', name: 'SQL query',  dimension: 'quality',   input: 'Write a SQL query to find the top 5 customers by total order value in a database with tables: customers(id, name) and orders(id, customer_id, amount).' },
  { id: 'b4', name: 'Bug fix',    dimension: 'reasoning', input: 'This Python code has a bug: `def add(a, b): return a - b`. Fix it and explain what was wrong.' },
  { id: 'b5', name: 'Regex',      dimension: 'quality',   input: 'Write a regex that matches valid email addresses.' },
]

function scoreResponse(input: string, response: string): number {
  if (response.includes('LLM call skipped')) return 0
  // Heuristic scoring based on response quality indicators
  let score = 0.5
  if (response.length > 100) score += 0.1
  if (response.length > 300) score += 0.1
  if (response.includes('```')) score += 0.1  // code blocks
  if (response.toLowerCase().includes('def ') || response.toLowerCase().includes('function')) score += 0.1
  if (response.toLowerCase().includes('because') || response.toLowerCase().includes('therefore')) score += 0.1
  return Math.min(score, 1.0)
}

export async function runBench(args: BenchRunArgs): Promise<CLIResult> {
  const { dimension, modelId = DEFAULT_MODEL, sampleSize = 3 } = args

  const tasks = (dimension
    ? SAMPLE_TASKS.filter(t => t.dimension === dimension)
    : SAMPLE_TASKS
  ).slice(0, sampleSize)

  if (tasks.length === 0) {
    console.log(`No tasks found for dimension: ${dimension}`)
    return { ok: false, message: `No tasks for dimension: ${dimension}` }
  }

  console.log(`\n📊 NexusMind Benchmark`)
  console.log(`   Model: ${modelId}`)
  console.log(`   Tasks: ${tasks.length}${dimension ? ` (${dimension})` : ''}\n`)

  const results: Array<{ task: string; dimension: string; score: number; durationMs: number }> = []

  for (const task of tasks) {
    const start = Date.now()
    process.stdout.write(`  [${task.name}] running...`)
    try {
      const response = await callLLM(
        'You are a helpful coding assistant. Answer concisely and correctly.',
        task.input,
        modelId
      )
      const durationMs = Date.now() - start
      const score = scoreResponse(task.input, response)
      results.push({ task: task.name, dimension: task.dimension, score, durationMs })
      console.log(` done  score=${(score * 100).toFixed(0)}%  time=${durationMs}ms`)
    } catch (err) {
      const durationMs = Date.now() - start
      results.push({ task: task.name, dimension: task.dimension, score: 0, durationMs })
      console.log(` error: ${String(err)}`)
    }
  }

  const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length
  const avgTime  = results.reduce((s, r) => s + r.durationMs, 0) / results.length

  console.log('\n┌─────────────────┬───────────┬───────┬────────┐')
  console.log('│ Task            │ Dimension │ Score │  Time  │')
  console.log('├─────────────────┼───────────┼───────┼────────┤')
  for (const r of results) {
    const task = r.task.padEnd(15)
    const dim  = r.dimension.padEnd(9)
    const score = `${(r.score * 100).toFixed(0)}%`.padStart(5)
    const time = `${r.durationMs}ms`.padStart(6)
    console.log(`│ ${task} │ ${dim} │ ${score} │ ${time} │`)
  }
  console.log('├─────────────────┼───────────┼───────┼────────┤')
  const avg   = `${(avgScore * 100).toFixed(1)}%`.padStart(5)
  const avgT  = `${Math.round(avgTime)}ms`.padStart(6)
  console.log(`│ AVERAGE         │           │ ${avg} │ ${avgT} │`)
  console.log('└─────────────────┴───────────┴───────┴────────┘\n')

  return { ok: true, message: `Average score: ${(avgScore * 100).toFixed(1)}%`, data: results }
}

// ─── run-guard ────────────────────────────────────────────────────────────────

interface FindingSummary {
  severity: string
  message: string
  source: string
}

export async function runGuard(_args: GuardRunArgs): Promise<CLIResult> {
  console.log('\n🛡️  NexusMind Guard\n')
  const findings: FindingSummary[] = []

  // npm audit
  console.log('  [NPM AUDIT] checking for vulnerable dependencies...')
  try {
    let auditOutput = ''
    try {
      auditOutput = execSync('npm audit --json 2>/dev/null', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (e: any) {
      // npm audit exits with non-zero if vulnerabilities found — still parse stdout
      auditOutput = e.stdout ?? ''
    }
    if (auditOutput) {
      const data = JSON.parse(auditOutput) as {
        vulnerabilities?: Record<string, { severity: string; name?: string; title?: string }>
        metadata?: { vulnerabilities?: Record<string, number> }
      }
      const vulns = data.vulnerabilities ?? {}
      let count = 0
      for (const [pkg, info] of Object.entries(vulns)) {
        findings.push({
          severity: info.severity?.toUpperCase() ?? 'LOW',
          message: `${pkg}: ${info.title ?? 'vulnerability found'}`,
          source: 'npm-audit',
        })
        count++
      }
      console.log(`     Found ${count} vulnerable package(s)`)
    } else {
      console.log('     No output from npm audit')
    }
  } catch (err) {
    console.log(`     npm audit failed: ${String(err)}`)
  }

  // Secrets scan (look for .env files and common secret patterns)
  console.log('  [SECRETS SCAN] checking for exposed secrets...')
  try {
    const envFiles = execSync(
      'find . -maxdepth 4 -name ".env" -o -name ".env.local" -o -name ".env.production" 2>/dev/null | grep -v node_modules | head -20',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim()
    for (const file of envFiles.split('\n').filter(Boolean)) {
      findings.push({ severity: 'MEDIUM', message: `Untracked env file detected: ${file}`, source: 'secrets-scan' })
    }
    // Check for hardcoded secrets in common patterns
    try {
      const secretPatterns = execSync(
        'grep -rn --include="*.ts" --include="*.js" --include="*.json" -E "(api_key|apikey|secret|password)\\s*[=:]\\s*[\\x27\\x22][a-zA-Z0-9_-]{16,}" . 2>/dev/null | grep -v node_modules | grep -v dist | head -20',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim()
      if (secretPatterns) {
        for (const line of secretPatterns.split('\n').filter(Boolean)) {
          findings.push({ severity: 'HIGH', message: `Potential hardcoded secret: ${line.slice(0, 120)}`, source: 'secrets-scan' })
        }
      }
    } catch {}
    console.log(`     Found ${findings.filter(f => f.source === 'secrets-scan').length} potential secret issue(s)`)
  } catch (err) {
    console.log(`     Secrets scan failed: ${String(err)}`)
  }

  // Print summary
  const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1
  }

  console.log('\n📋 Guard Summary:')
  console.log(`   CRITICAL : ${counts.CRITICAL ?? 0}`)
  console.log(`   HIGH     : ${counts.HIGH ?? 0}`)
  console.log(`   MEDIUM   : ${counts.MEDIUM ?? 0}`)
  console.log(`   LOW      : ${counts.LOW ?? 0}`)
  console.log(`   TOTAL    : ${findings.length}`)

  if (findings.length > 0) {
    console.log('\nTop findings:')
    for (const f of findings.slice(0, 8)) {
      console.log(`  [${f.severity.padEnd(8)}] ${f.message.slice(0, 100)}`)
    }
    if (findings.length > 8) console.log(`  ... and ${findings.length - 8} more`)
  } else {
    console.log('\n✅ No issues detected')
  }

  console.log()
  return { ok: true, message: `${findings.length} findings`, data: counts }
}

// ─── nexusmind ────────────────────────────────────────────────────────────────

function findRepoRoot(): string {
  let dir = __dirname
  while (dir !== path.dirname(dir)) {
    const pkgPath = path.join(dir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      if (pkg.name === 'nexusmind') {
        return dir
      }
    }
    dir = path.dirname(dir)
  }
  return process.cwd()
}

export function getVersion(): string {
  const repoRoot = findRepoRoot()
  const rootPkgPath = path.join(repoRoot, 'package.json')
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'))
  return rootPkg.version ?? '0.0.0'
}

export function openNexusMind(targetPath = '.'): void {
  const repoRoot = findRepoRoot()
  const desktopMain = path.join(repoRoot, 'apps/desktop/out/main/index.js')

  if (!fs.existsSync(desktopMain)) {
    console.error(`Desktop app not found at ${desktopMain}. Run "pnpm build:desktop" first.`)
    process.exit(1)
  }

  let electronPath: string
  try {
    electronPath = require('electron')
  } catch {
    // Try resolving from desktop package node_modules
    const desktopElectron = path.join(repoRoot, 'apps/desktop/node_modules/electron')
    try {
      electronPath = require(desktopElectron)
    } catch {
      console.error('Electron not found. Make sure dependencies are installed.')
      process.exit(1)
    }
  }

  const resolvedPath = path.resolve(targetPath)
  const child = spawn(electronPath, [desktopMain, resolvedPath], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  console.log(`Opening NexusMind at ${resolvedPath}`)
}

// ─── repl ─────────────────────────────────────────────────────────────────────

export async function startRepl(): Promise<void> {
  const { startRepl: _startRepl } = await import('./repl')
  return _startRepl()
}
