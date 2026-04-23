import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
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

  installPreCommitHook(): { installed: boolean; path: string; error?: string } {
    if (!this.repoPath) {
      return { installed: false, path: '', error: 'Git repository not set. Call setRepo first.' }
    }

    try {
      const hooksDir = path.join(this.repoPath, '.git', 'hooks')
      if (!fs.existsSync(hooksDir)) {
        fs.mkdirSync(hooksDir, { recursive: true })
      }

      const hookPath = path.join(hooksDir, 'pre-commit')
      const hookContent = `#!/bin/sh
# NexusGuard pre-commit hook
# Automatically runs security scan before each commit
echo "[NexusGuard] Running pre-commit security scan..."

# Check for secrets in staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -v node_modules | grep -v '.lock$')

if [ -z "$STAGED_FILES" ]; then
  echo "[NexusGuard] No staged files to scan."
  exit 0
fi

SECRETS_FOUND=0

for FILE in $STAGED_FILES; do
  # Check for common secret patterns
  if git diff --cached -- "$FILE" | grep -qE '(api[_-]?key|apikey|secret|token|password|passwd|pwd)\\s*[:=]\\s*["'"'"']?[A-Za-z0-9\\-_]{16,}'; then
    echo "[NexusGuard] WARNING: Potential secret detected in $FILE"
    SECRETS_FOUND=1
  fi

  # Check for OpenAI keys
  if git diff --cached -- "$FILE" | grep -qE 'sk-[A-Za-z0-9]{40,}'; then
    echo "[NexusGuard] CRITICAL: OpenAI API key detected in $FILE"
    SECRETS_FOUND=1
  fi

  # Check for AWS keys
  if git diff --cached -- "$FILE" | grep -qE 'AKIA[0-9A-Z]{16}'; then
    echo "[NexusGuard] CRITICAL: AWS access key detected in $FILE"
    SECRETS_FOUND=1
  fi

  # Check for GitHub tokens
  if git diff --cached -- "$FILE" | grep -qE 'ghp_[A-Za-z0-9]{36}'; then
    echo "[NexusGuard] CRITICAL: GitHub token detected in $FILE"
    SECRETS_FOUND=1
  fi
done

if [ $SECRETS_FOUND -ne 0 ]; then
  echo ""
  echo "[NexusGuard] COMMIT BLOCKED: Secrets detected in staged files."
  echo "[NexusGuard] Remove secrets and rotate them immediately."
  echo "[NexusGuard] Use 'git commit --no-verify' to bypass (not recommended)."
  exit 1
fi

echo "[NexusGuard] No secrets detected. Commit allowed."
exit 0
`

      fs.writeFileSync(hookPath, hookContent, { mode: 0o755 })
      return { installed: true, path: hookPath }
    } catch (err: any) {
      return { installed: false, path: '', error: String(err?.message ?? err) }
    }
  }

  uninstallPreCommitHook(): { removed: boolean; error?: string } {
    if (!this.repoPath) {
      return { removed: false, error: 'Git repository not set.' }
    }

    try {
      const hookPath = path.join(this.repoPath, '.git', 'hooks', 'pre-commit')
      if (fs.existsSync(hookPath)) {
        const content = fs.readFileSync(hookPath, 'utf-8')
        if (content.includes('NexusGuard')) {
          fs.unlinkSync(hookPath)
          return { removed: true }
        }
        return { removed: false, error: 'Pre-commit hook exists but is not managed by NexusGuard.' }
      }
      return { removed: false, error: 'No pre-commit hook found.' }
    } catch (err: any) {
      return { removed: false, error: String(err?.message ?? err) }
    }
  }

  isPreCommitHookInstalled(): boolean {
    if (!this.repoPath) return false
    try {
      const hookPath = path.join(this.repoPath, '.git', 'hooks', 'pre-commit')
      if (!fs.existsSync(hookPath)) return false
      const content = fs.readFileSync(hookPath, 'utf-8')
      return content.includes('NexusGuard')
    } catch {
      return false
    }
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
      'git:installPreCommitHook': () => this.installPreCommitHook(),
      'git:uninstallPreCommitHook': () => this.uninstallPreCommitHook(),
      'git:isPreCommitHookInstalled': () => this.isPreCommitHookInstalled(),
    }
  }

  init(): void {
    ServiceRegistry.getInstance().register(SERVICE_TOKENS.GitService, this)
  }
}
