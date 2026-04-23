import React, { useState, useRef, useEffect, useCallback } from 'react'
import styles from './InlineChat.module.css'

interface InlineChatProps {
  editorRef: React.RefObject<any>
  filePath: string | null
  onClose: () => void
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

export function InlineChat({ editorRef, filePath, onClose }: InlineChatProps): React.ReactElement | null {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(prev => !prev)
      }
      if (e.key === 'Escape' && isOpen) {
        onClose()
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const getSelectedText = useCallback((): string => {
    if (!editorRef.current) return ''
    const selection = editorRef.current.getSelection()
    if (!selection) return ''
    return editorRef.current.getModel().getValueInRange(selection)
  }, [editorRef])

  const applyEdit = useCallback((edit: string) => {
    if (!editorRef.current) return
    
    const selection = editorRef.current.getSelection()
    if (selection && !selection.isEmpty()) {
      editorRef.current.executeEdits('inline-chat', [{
        range: selection,
        text: edit,
      }])
    } else {
      const position = editorRef.current.getPosition()
      if (position) {
        editorRef.current.executeEdits('inline-chat', [{
          range: {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          },
          text: edit,
        }])
      }
    }
  }, [editorRef])

  const handleSubmit = async () => {
    if (!input.trim() || !filePath || isLoading) return

    const selectedText = getSelectedText()
    const userMessage = selectedText 
      ? `${input}\n\nSelected code:\n\`\`\`\n${selectedText}\n\`\`\``
      : input

    setMessages(prev => [...prev, { role: 'user', content: input }])
    setInput('')
    setIsLoading(true)

    try {
      setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }])

      const modelConfig = {
        id: 'claude-sonnet-4-6',
        provider: 'anthropic',
        name: 'Claude Sonnet 4.6',
        capabilities: ['chat', 'streaming'],
        contextWindow: 200000,
        maxTokens: 4096,
      }

      const messages_for_api = [
        {
          id: crypto.randomUUID(),
          agentId: 'inline-chat',
          role: 'user',
          content: `You are a coding assistant. ${selectedText ? 'The user has selected some code. ' : ''}Respond with ONLY the code changes, no explanations unless asked.\n\n${userMessage}`,
          timestamp: Date.now(),
        },
      ]

      let responseContent = ''
      const response = await window.electronAPI.invoke('models:streamChat', modelConfig.id, messages_for_api)

      if (response.streamId) {
        const handleStreamData = (event: any, chunk: any) => {
          if (chunk.content) {
            responseContent += chunk.content
            setMessages(prev => {
              const newMessages = [...prev]
              const lastMessage = newMessages[newMessages.length - 1]
              if (lastMessage.role === 'assistant') {
                lastMessage.content = responseContent
              }
              return newMessages
            })
          }
          if (chunk.isDone) {
            setMessages(prev => {
              const newMessages = [...prev]
              const lastMessage = newMessages[newMessages.length - 1]
              if (lastMessage.role === 'assistant') {
                lastMessage.isStreaming = false
              }
              return newMessages
            })
            setIsLoading(false)
            window.electronAPI.removeListener('stream:data', handleStreamData)
            window.electronAPI.removeListener('stream:end', handleStreamEnd)
          }
        }

        const handleStreamEnd = () => {
          setIsLoading(false)
          window.electronAPI.removeListener('stream:data', handleStreamData)
          window.electronAPI.removeListener('stream:end', handleStreamEnd)
        }

        window.electronAPI.on('stream:data', handleStreamData)
        window.electronAPI.on('stream:end', handleStreamEnd)
      }
    } catch (err) {
      console.error('Inline chat error:', err)
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Error: Failed to get response. Check your API key.',
        isStreaming: false 
      }])
      setIsLoading(false)
    }
  }

  const handleApply = () => {
    const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop()
    if (lastAssistantMessage && lastAssistantMessage.content) {
      const codeMatch = lastAssistantMessage.content.match(/```[\w]*\n?([\s\S]*?)```/)
      const codeToApply = codeMatch ? codeMatch[1].trim() : lastAssistantMessage.content.trim()
      applyEdit(codeToApply)
      onClose()
      setIsOpen(false)
      setMessages([])
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  if (!isOpen) {
    return (
      <button 
        className={styles.trigger}
        onClick={() => setIsOpen(true)}
        title="Open AI chat (Cmd+K)"
      >
        ✨
      </button>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>AI Assistant</span>
        <button className={styles.closeBtn} onClick={() => { onClose(); setIsOpen(false); }}>×</button>
      </div>
      
      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            Ask me to edit code, explain, or refactor
          </div>
        )}
        {messages.map((msg, idx) => (
          <div key={idx} className={`${styles.message} ${styles[msg.role]}`}>
            <div className={styles.role}>{msg.role === 'user' ? 'You' : 'AI'}</div>
            <pre className={styles.content}>{msg.content}{msg.isStreaming && <span className={styles.cursor}>▊</span>}</pre>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask AI to edit code..."
          className={styles.input}
          disabled={isLoading}
        />
        <button 
          onClick={handleSubmit}
          disabled={isLoading || !input.trim()}
          className={styles.sendBtn}
        >
          {isLoading ? '...' : '→'}
        </button>
      </div>

      {messages.some(m => m.role === 'assistant' && !m.isStreaming) && (
        <div className={styles.actions}>
          <button onClick={handleApply} className={styles.applyBtn}>
            Apply Changes
          </button>
          <button onClick={() => setMessages([])} className={styles.clearBtn}>
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
