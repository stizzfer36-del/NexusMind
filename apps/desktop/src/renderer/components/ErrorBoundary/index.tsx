import React from 'react'

interface Props {
  children: React.ReactNode
  panelName?: string
}

interface State {
  hasError: boolean
  error: Error | null
  info: React.ErrorInfo | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[ErrorBoundary] Caught error in panel "${this.props.panelName ?? 'unknown'}":`,
      error,
      info
    )
    this.setState({ info })
  }

  private handleCopy = () => {
    const { error, info } = this.state
    const text = [
      error?.toString() ?? '',
      info?.componentStack ?? '',
    ].join('\n')
    navigator.clipboard.writeText(text).catch(() => {
      /* clipboard unavailable — silently ignore */
    })
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null, info: null })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const { error, info } = this.state
    const title = this.props.panelName
      ? `Something went wrong in ${this.props.panelName}`
      : 'Something went wrong in this panel'

    const containerStyle: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      width: '100%',
      padding: '2rem',
      boxSizing: 'border-box',
      background: 'var(--color-bg, #1a1a2e)',
      color: 'var(--color-text, #e0e0e0)',
      fontFamily: 'inherit',
    }

    const headingStyle: React.CSSProperties = {
      margin: '0 0 1rem',
      fontSize: '1.1rem',
      fontWeight: 600,
      color: 'var(--color-accent, #e94560)',
    }

    const detailsStyle: React.CSSProperties = {
      width: '100%',
      maxWidth: '640px',
      marginBottom: '1.25rem',
      background: 'rgba(0,0,0,0.25)',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.08)',
      padding: '0.5rem 0.75rem',
    }

    const summaryStyle: React.CSSProperties = {
      cursor: 'pointer',
      fontSize: '0.8rem',
      opacity: 0.7,
      userSelect: 'none',
    }

    const preStyle: React.CSSProperties = {
      margin: '0.5rem 0 0',
      fontSize: '0.72rem',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      opacity: 0.85,
      maxHeight: '200px',
      overflowY: 'auto',
    }

    const buttonRowStyle: React.CSSProperties = {
      display: 'flex',
      gap: '0.75rem',
    }

    const buttonBase: React.CSSProperties = {
      padding: '0.4rem 1rem',
      borderRadius: '5px',
      border: '1px solid rgba(255,255,255,0.15)',
      background: 'rgba(255,255,255,0.06)',
      color: 'var(--color-text, #e0e0e0)',
      cursor: 'pointer',
      fontSize: '0.85rem',
      transition: 'background 0.15s',
    }

    const accentButton: React.CSSProperties = {
      ...buttonBase,
      background: 'var(--color-accent, #e94560)',
      border: 'none',
      color: '#fff',
    }

    const stack = [error?.stack ?? error?.toString() ?? '', info?.componentStack ?? ''].join('\n')

    return (
      <div style={containerStyle}>
        <h2 style={headingStyle}>{title}</h2>

        <details style={detailsStyle}>
          <summary style={summaryStyle}>Error details</summary>
          <pre style={preStyle}>{stack}</pre>
        </details>

        <div style={buttonRowStyle}>
          <button style={buttonBase} onClick={this.handleCopy}>
            Copy error details
          </button>
          <button style={accentButton} onClick={this.handleReload}>
            Reload panel
          </button>
        </div>
      </div>
    )
  }
}
