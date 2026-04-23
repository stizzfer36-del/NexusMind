import { execSync } from 'child_process'
import { ServiceRegistry, SERVICE_TOKENS } from '../ServiceRegistry.js'

export class GitService {
  private repoPath: string | null = null

  private _run(cmd: string): string {
    if (this.repoPath === null) {
      throw new Error('Git repository not set. Call setRepo first.')
    }
    return execSync(cmd, {
      cwd: this.repoPath,
      encoding: 'utf8',
      timeout: 15000,
    }).trim()
  }

  setRepo(path: string): void {
    this.repoPath = path
  }

  status(): string {
    return this._run('git status --short')
  }

  diff(file?: string): string {
    if (file) {
      return this._run(`git diff -- ${file}`)
    }
    return this._run('git diff')
  }

  log(n = 20): string {
    return this._run(`git log --oneline -n ${n}`)
  }

  branch(): string {
    return this._run('git branch --show-current')
  }

  listBranches(): string {
    return this._run('git branch -a')
  }

  commit(message: string, files?: string[]): string {
    if (files && files.length > 0) {
      this._run(`git add ${files.map((f) => `"${f.replace(/"/g, '\\"')}"`).join(' ')}`)
    }
    return this._run(`git commit -m "${message.replace(/"/g, '\\"')}"`)
  }

  createBranch(name: string): string {
    return this._run(`git branch ${name}`)
  }

  checkoutBranch(name: string): string {
    return this._run(`git checkout ${name}`)
  }

  getMCPTools(): Array<{
    name: string
    description: string
    execute: (args: Record<string, unknown>) => unknown | Promise<unknown>
  }> {
    return [
      {
        name: 'git_status',
        description: 'Get the short git status of the repository',
        execute: () => {
          try {
            return { success: true, output: this.status() }
          } catch (err) {
            return { success: false, error: String(err) }
          }
        },
      },
      {
        name: 'git_diff',
        description: 'Get git diff for the entire repository or a specific file',
        execute: (args) => {
          try {
            const file = args['file'] as string | undefined
            return { success: true, output: this.diff(file) }
          } catch (err) {
            return { success: false, error: String(err) }
          }
        },
      },
      {
        name: 'git_commit',
        description: 'Commit changes with a message, optionally staging specific files first',
        execute: (args) => {
          try {
            const message = args['message'] as string
            const files = args['files'] as string[] | undefined
            return { success: true, output: this.commit(message, files) }
          } catch (err) {
            return { success: false, error: String(err) }
          }
        },
      },
      {
        name: 'git_log',
        description: 'Get recent git log entries',
        execute: (args) => {
          try {
            const n = typeof args['n'] === 'number' ? args['n'] : 20
            return { success: true, output: this.log(n) }
          } catch (err) {
            return { success: false, error: String(err) }
          }
        },
      },
      {
        name: 'git_branch',
        description: 'Get the current git branch name',
        execute: () => {
          try {
            return { success: true, output: this.branch() }
          } catch (err) {
            return { success: false, error: String(err) }
          }
        },
      },
      {
        name: 'git_create_branch',
        description: 'Create a new git branch',
        execute: (args) => {
          try {
            const name = args['name'] as string
            return { success: true, output: this.createBranch(name) }
          } catch (err) {
            return { success: false, error: String(err) }
          }
        },
      },
    ]
  }

  getHandlers(): Record<string, (event: any, ...args: any[]) => any> {
    return {
      'git:status': () => this.status(),
      'git:diff': (_event: any, file?: string) => this.diff(file),
      'git:commit': (_event: any, message: string, files?: string[]) => this.commit(message, files),
      'git:log': (_event: any, n?: number) => this.log(n ?? 20),
      'git:branch': () => this.branch(),
      'git:listBranches': () => this.listBranches(),
      'git:createBranch': (_event: any, name: string) => this.createBranch(name),
      'git:setRepo': (_event: any, path: string) => this.setRepo(path),
    }
  }

  init(): void {
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.GitService, this)
  }
}
