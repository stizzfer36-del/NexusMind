export interface DiffLine {
  type: 'context' | 'added' | 'removed'
  text: string
}

export interface DiffHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: DiffLine[]
}

export interface DiffResult {
  hunks: DiffHunk[]
}

function longestCommonSubsequence<T>(a: T[], b: T[]): number[][] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  return dp
}

function backtrackLCS<T>(dp: number[][], a: T[], b: T[]): T[] {
  const result: T[] = []
  let i = a.length
  let j = b.length
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1])
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }
  return result
}

export function computeDiff(before: string, after: string): DiffResult {
  const oldLines = before.split('\n')
  const newLines = after.split('\n')
  const dp = longestCommonSubsequence(oldLines, newLines)
  const lcs = backtrackLCS(dp, oldLines, newLines)

  const hunks: DiffHunk[] = []
  let oldIndex = 0
  let newIndex = 0
  let lcsIndex = 0
  let currentHunk: DiffHunk | null = null

  function flushHunk(): void {
    if (currentHunk && currentHunk.lines.length > 0) {
      hunks.push(currentHunk)
    }
    currentHunk = null
  }

  function startHunk(): DiffHunk {
    if (!currentHunk) {
      currentHunk = {
        oldStart: oldIndex + 1,
        oldCount: 0,
        newStart: newIndex + 1,
        newCount: 0,
        lines: [],
      }
    }
    return currentHunk
  }

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    const lcsLine = lcs[lcsIndex]

    if (
      oldIndex < oldLines.length &&
      newIndex < newLines.length &&
      oldLines[oldIndex] === newLines[newIndex] &&
      oldLines[oldIndex] === lcsLine
    ) {
      flushHunk()
      oldIndex++
      newIndex++
      lcsIndex++
      continue
    }

    const hunk = startHunk()

    if (oldIndex < oldLines.length && oldLines[oldIndex] !== lcsLine) {
      hunk.lines.push({ type: 'removed', text: oldLines[oldIndex] })
      hunk.oldCount++
      oldIndex++
      continue
    }

    if (newIndex < newLines.length && newLines[newIndex] !== lcsLine) {
      hunk.lines.push({ type: 'added', text: newLines[newIndex] })
      hunk.newCount++
      newIndex++
      continue
    }

    // Should not reach here if logic is correct, but safeguard
    flushHunk()
    oldIndex++
    newIndex++
  }

  flushHunk()
  return { hunks }
}

export function applyDiff(original: string, diff: DiffResult): string {
  const oldLines = original.split('\n')
  const result: string[] = []
  let oldIndex = 0

  for (const hunk of diff.hunks) {
    // Copy context lines before hunk
    while (oldIndex < hunk.oldStart - 1) {
      result.push(oldLines[oldIndex])
      oldIndex++
    }

    for (const line of hunk.lines) {
      if (line.type === 'context') {
        result.push(line.text)
        oldIndex++
      } else if (line.type === 'added') {
        result.push(line.text)
      } else if (line.type === 'removed') {
        oldIndex++
      }
    }
  }

  while (oldIndex < oldLines.length) {
    result.push(oldLines[oldIndex])
    oldIndex++
  }

  return result.join('\n')
}
