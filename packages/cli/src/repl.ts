import readline from 'readline'
import { runSwarm, runGraph, runBench, runGuard } from './NexusCliRunner'

function printHelp(): void {
  console.log(`
NexusMind REPL — available commands:

  swarm <goal>              Run an agent swarm with the given goal
  graph <dagId> [input]     Execute a saved workflow DAG
  bench [dimension]         Run benchmark tasks (optionally filtered by dimension)
  guard                     Run security guard scan
  help                      Show this help message
  exit / quit               Exit the REPL

Examples:
  nexus> swarm Implement a REST endpoint for user login
  nexus> graph my-workflow Build the authentication module
  nexus> bench reasoning
  nexus> guard
`)
}

export async function startRepl(): Promise<void> {
  console.log('\n⚡ NexusMind REPL')
  console.log('   Type "help" for commands, "exit" to quit.\n')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY,
    prompt: 'nexus> ',
  })

  rl.prompt()

  await new Promise<void>((resolve) => {
    rl.on('line', async (rawLine: string) => {
      const line = rawLine.trim()
      if (!line) {
        rl.prompt()
        return
      }

      const parts = line.split(/\s+/)
      const cmd = parts[0].toLowerCase()
      const rest = parts.slice(1).join(' ')

      try {
        switch (cmd) {
          case 'swarm': {
            if (!rest) {
              console.log('Usage: swarm <goal text>')
              break
            }
            await runSwarm({ goal: rest, maxAgents: 3, maxRounds: 1 })
            break
          }

          case 'graph': {
            const [dagId, ...inputParts] = parts.slice(1)
            if (!dagId) {
              console.log('Usage: graph <dagId> [input text]')
              break
            }
            await runGraph({ dagId, input: inputParts.length > 0 ? inputParts.join(' ') : undefined })
            break
          }

          case 'bench': {
            const dimension = rest || undefined
            await runBench({ dimension, sampleSize: 3 })
            break
          }

          case 'guard': {
            await runGuard({})
            break
          }

          case 'help': {
            printHelp()
            break
          }

          case 'exit':
          case 'quit': {
            console.log('\nGoodbye! 👋\n')
            rl.close()
            return
          }

          default: {
            console.log(`Unknown command: "${cmd}". Type "help" for available commands.`)
            break
          }
        }
      } catch (err) {
        console.error(`Error: ${String(err)}`)
      }

      rl.prompt()
    })

    rl.on('close', () => {
      resolve()
    })

    rl.on('SIGINT', () => {
      console.log('\n(Use "exit" to quit)')
      rl.prompt()
    })
  })
}
