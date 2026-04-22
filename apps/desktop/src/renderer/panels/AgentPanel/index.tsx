import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAgent } from '../../features/agent/useAgent'
import styles from './AgentPanel.module.css'

export function AgentPanel() {
  const {
    messages,
    isStreaming,
    streamText,
    terminalOutput,
    pendingDiff,
    pendingApproval,
    activeFile,
    sendPrompt,
    approvePending,
    rejectPending,
  } = useAgent()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamText])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    sendPrompt(text)
  }, [input, isStreaming, sendPrompt])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  return (
    <div className={styles.root} data-testid="agent-panel">
      <div className={styles.header}>
        <span>AI Agent</span>
        {isStreaming && <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)' }}>Streaming…</span>}
      </div>

      <div className={styles.main}>
        {/* Chat area */}
        <div className={styles.chatArea}>
          <div className={styles.messages}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.message} ${styles[`message${msg.role.charAt(0).toUpperCase() + msg.role.slice(1)}`]}`}
              >
                <span className={styles.messageRole}>{msg.role}</span>
                <div className={styles.messageContent}>{msg.content}</div>
              </div>
            ))}
            {isStreaming && (
              <div className={`${styles.message} ${styles.messageAssistant}`}>
                <span className={styles.messageRole}>assistant</span>
                <div className={styles.messageContent}>
                  {streamText}
                  <span className={styles.streamingCursor} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Inline diff proposal */}
          {pendingDiff && (
            <div className={styles.diffSection} data-testid="diff-proposal">
              <div className={styles.diffTitle}>
                <span>Proposed changes to</span>
                <span className={styles.diffFile}>{pendingDiff.filePath}</span>
              </div>
              {pendingDiff.diff.hunks.map((hunk, hi) => (
                <div key={hi} className={styles.diffHunk}>
                  <div className={styles.diffHunkHeader}>
                    @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
                  </div>
                  {hunk.lines.map((line, li) => (
                    <div
                      key={li}
                      className={`${styles.diffLine} ${line.type === 'added' ? styles.diffAdded : line.type === 'removed' ? styles.diffRemoved : ''}`}
                    >
                      {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                      {line.text}
                    </div>
                  ))}
                </div>
              ))}
              <div className={styles.diffActions}>
                <button className={styles.rejectBtn} onClick={rejectPending} data-testid="diff-reject">
                  Reject
                </button>
                <button className={styles.approveBtn} onClick={approvePending} data-testid="diff-approve">
                  Approve
                </button>
              </div>
            </div>
          )}

          {/* Input */}
          <div className={styles.inputArea}>
            <input
              ref={inputRef}
              className={styles.input}
              placeholder="Ask the agent…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              data-testid="agent-input"
            />
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={isStreaming || !input.trim()}
              data-testid="agent-send"
            >
              Send
            </button>
          </div>
        </div>

        {/* Side panel */}
        <div className={styles.sidePanel}>
          {/* Active file */}
          <div className={styles.sideSection}>
            <div className={styles.sideTitle}>Active File</div>
            <div className={styles.fileContext} data-testid="active-file">
              {activeFile ? (
                <>
                  <div className={styles.fileName}>{activeFile.path}</div>
                  <div>{activeFile.content.length} chars</div>
                </>
              ) : (
                <span>No file active</span>
              )}
            </div>
          </div>

          {/* Terminal embed */}
          <div className={styles.sideSection} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className={styles.sideTitle}>Terminal</div>
            <div className={styles.terminalEmbed} data-testid="terminal-embed">
              {terminalOutput.length === 0 ? (
                <span style={{ opacity: 0.4 }}>No output yet</span>
              ) : (
                terminalOutput.map((line, i) => (
                  <div key={i} className={styles.terminalLine}>
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Guard approval modal */}
      {pendingApproval && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" data-testid="guard-approval-modal">
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <span className={styles.shieldIcon}>⛨</span>
              <h2 className={styles.modalTitle}>Guard Approval Required</h2>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalAction}>
                <span className={styles.modalLabel}>Action:</span>
                <span className={styles.modalValue}>{pendingApproval.action}</span>
              </div>
              <div className={`${styles.severityBadge} ${styles.severityMedium}`}>
                {pendingApproval.severity}
              </div>
              <p className={styles.modalReason}>{pendingApproval.reason}</p>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.modalRejectBtn} onClick={rejectPending} data-testid="modal-reject">
                Reject
              </button>
              <button className={styles.modalApproveBtn} onClick={approvePending} data-testid="modal-approve">
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
