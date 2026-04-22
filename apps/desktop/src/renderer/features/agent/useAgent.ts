import { useCallback, useEffect, useRef, useState } from 'react'
import { useIPC, useIPCEvent } from '../../hooks'
import type { DiffResult } from '@nexusmind/shared'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface DiffProposal {
  filePath: string
  original: string
  updated: string
  diff: DiffResult
  reason: string
}

export interface ApprovalRequest {
  requestId: string
  action: string
  reason: string
  severity: string
}

export function useAgent() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [terminalOutput, setTerminalOutput] = useState<string[]>([])
  const [pendingDiff, setPendingDiff] = useState<DiffProposal | null>(null)
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null)
  const [activeFile, setActiveFile] = useState<{ path: string; content: string } | null>(null)

  const fileReadIPC = useIPC<'file:read'>()
  const fileWriteIPC = useIPC<'file:write'>()
  const fileApplyDiffIPC = useIPC<'file:applyDiff'>()
  const fileListDirIPC = useIPC<'file:listDir'>()
  const contextGetSystemIPC = useIPC<'context:getSystemContext'>()
  const modelStreamIPC = useIPC<'model:stream'>()

  const messagesRef = useRef(messages)
  messagesRef.current = messages

  // Listen for model streaming tokens
  useIPCEvent(
    'model:token',
    useCallback(
      (payload: { streamId: string; token: string; index: number }) => {
        if (!isStreaming) return
        setStreamText((prev) => prev + payload.token)
      },
      [isStreaming]
    )
  )

  useIPCEvent(
    'model:done',
    useCallback(
      (payload: { streamId: string; finishReason?: string; usage?: any }) => {
        setIsStreaming(false)
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: streamText,
            timestamp: Date.now(),
          },
        ])
        setStreamText('')
      },
      [streamText]
    )
  )

  useIPCEvent(
    'model:error',
    useCallback(
      (payload: { streamId: string; error: string }) => {
        setIsStreaming(false)
        setTerminalOutput((prev) => [...prev, `[error] ${payload.error}`])
        setStreamText('')
      },
      []
    )
  )

  const readFile = useCallback(
    async (filePath: string): Promise<string> => {
      const content = await fileReadIPC.invoke('file:read', filePath)
      setActiveFile({ path: filePath, content })
      setTerminalOutput((prev) => [...prev, `$ cat ${filePath}`])
      return content
    },
    [fileReadIPC]
  )

  const writeFile = useCallback(
    async (filePath: string, content: string) => {
      await fileWriteIPC.invoke('file:write', filePath, content)
      setTerminalOutput((prev) => [...prev, `$ echo "..." > ${filePath}`])
      setActiveFile({ path: filePath, content })
    },
    [fileWriteIPC]
  )

  const applyDiffToFile = useCallback(
    async (filePath: string, diff: DiffResult): Promise<string> => {
      const result = await fileApplyDiffIPC.invoke('file:applyDiff', filePath, diff)
      setTerminalOutput((prev) => [...prev, `$ patch ${filePath}`])
      setActiveFile({ path: filePath, content: result })
      return result
    },
    [fileApplyDiffIPC]
  )

  const listDir = useCallback(
    async (dirPath: string) => {
      const entries = await fileListDirIPC.invoke('file:listDir', dirPath)
      return entries
    },
    [fileListDirIPC]
  )

  const proposeDiff = useCallback(
    (proposal: DiffProposal) => {
      setPendingDiff(proposal)
      setPendingApproval({
        requestId: `req-${Date.now()}`,
        action: `Apply diff to ${proposal.filePath}`,
        reason: proposal.reason,
        severity: 'MEDIUM',
      })
    },
    []
  )

  const approvePending = useCallback(async () => {
    if (!pendingDiff) return
    await applyDiffToFile(pendingDiff.filePath, pendingDiff.diff)
    setPendingDiff(null)
    setPendingApproval(null)
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        role: 'system',
        content: `✅ Diff applied to ${pendingDiff.filePath}`,
        timestamp: Date.now(),
      },
    ])
  }, [pendingDiff, applyDiffToFile])

  const rejectPending = useCallback(() => {
    setPendingDiff(null)
    setPendingApproval(null)
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        role: 'system',
        content: '❌ Diff rejected by user',
        timestamp: Date.now(),
      },
    ])
  }, [])

  const sendPrompt = useCallback(
    async (prompt: string) => {
      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsStreaming(true)
      setStreamText('')
      setTerminalOutput((prev) => [...prev, `> ${prompt}`])

      try {
        const systemContext = await contextGetSystemIPC.invoke('context:getSystemContext')
        await modelStreamIPC.invoke('model:stream', {
          modelId: 'claude-sonnet-4-6',
          messages: [
            { role: 'system', content: systemContext },
            ...messagesRef.current.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: prompt },
          ],
        })
      } catch (err) {
        setIsStreaming(false)
        const message = err instanceof Error ? err.message : String(err)
        setTerminalOutput((prev) => [...prev, `[error] ${message}`])
      }
    },
    [contextGetSystemIPC, modelStreamIPC]
  )

  const runCommand = useCallback(
    async (command: string) => {
      setTerminalOutput((prev) => [...prev, `$ ${command}`])
      // In a real implementation this would use mcp:executeTool with run_shell
      try {
        const result = await window.electronAPI.invoke('mcp:executeTool', {
          name: 'run_shell',
          args: { command },
        })
        const output = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        setTerminalOutput((prev) => [...prev, output])
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setTerminalOutput((prev) => [...prev, `[error] ${message}`])
      }
    },
    []
  )

  return {
    messages,
    isStreaming,
    streamText,
    terminalOutput,
    pendingDiff,
    pendingApproval,
    activeFile,
    sendPrompt,
    readFile,
    writeFile,
    applyDiffToFile,
    listDir,
    proposeDiff,
    approvePending,
    rejectPending,
    runCommand,
  }
}
