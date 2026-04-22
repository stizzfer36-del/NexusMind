import React, { useCallback, useEffect, useState } from 'react'
import { useIPC, useIPCEvent } from '../../hooks'
import styles from './SettingsPanel.module.css'

type Section = 'api-keys' | 'models' | 'appearance' | 'shortcuts' | 'link' | 'sync' | 'about'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'api-keys', label: 'API Keys' },
  { id: 'models', label: 'Models' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'link', label: 'Link' },
  { id: 'sync', label: 'Sync' },
  { id: 'about', label: 'About' },
]

const SHORTCUTS: { action: string; keys: string[] }[] = [
  { action: 'Open command palette', keys: ['⌘', 'K'] },
  { action: 'New terminal', keys: ['⌘', 'T'] },
  { action: 'Close terminal', keys: ['⌘', 'W'] },
  { action: 'Switch to terminal', keys: ['⌘', '1'] },
  { action: 'Switch to kanban', keys: ['⌘', '2'] },
  { action: 'Switch to swarm', keys: ['⌘', '3'] },
  { action: 'Switch to memory', keys: ['⌘', '4'] },
  { action: 'Switch to settings', keys: ['⌘', ','] },
  { action: 'Toggle sidebar', keys: ['⌘', '\\'] },
  { action: 'Toggle right panel', keys: ['⌘', ']'] },
]

interface ApiKeyField {
  provider: string
  label: string
  placeholder: string
}

const API_KEY_FIELDS: ApiKeyField[] = [
  { provider: 'openai', label: 'OpenAI API Key', placeholder: 'sk-...' },
  { provider: 'anthropic', label: 'Anthropic API Key', placeholder: 'sk-ant-...' },
  { provider: 'openrouter', label: 'OpenRouter API Key', placeholder: 'sk-or-...' },
  { provider: 'ollama', label: 'Ollama Base URL', placeholder: 'http://localhost:11434' },
]

function ApiKeyRow({ field }: { field: ApiKeyField }) {
  const [value, setValue] = useState('')
  const [visible, setVisible] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [modelCount, setModelCount] = useState<number | null>(null)
  const getIPC = useIPC<'keychain:get'>()
  const setIPC = useIPC<'keychain:set'>()
  const validateIPC = useIPC<'model:validate'>()
  const modelsIPC = useIPC<'models:list'>()

  // Load stored value
  useEffect(() => {
    getIPC.invoke('keychain:get', field.provider)
      .then(v => { if (v) setValue(v) })
      .catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(async () => {
    try {
      await setIPC.invoke('keychain:set', field.provider, value)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save API key:', err)
    }
  }, [setIPC, field.provider, value])

  const handleTest = useCallback(async () => {
    setTestStatus('testing')
    setModelCount(null)
    try {
      const valid = await validateIPC.invoke('model:validate', field.provider)
      if (valid) {
        setTestStatus('ok')
        // Get model count for this provider
        const allModels = await modelsIPC.invoke('models:list')
        const providerModels = allModels.filter((m: any) =>
          m.provider === field.provider || m.provider?.toLowerCase() === field.provider.toLowerCase()
        )
        setModelCount(providerModels.length)
      } else {
        setTestStatus('fail')
      }
    } catch {
      setTestStatus('fail')
    }
    setTimeout(() => setTestStatus('idle'), 5000)
  }, [validateIPC, modelsIPC, field.provider])

  return (
    <div className={styles.keyRow}>
      <label className={styles.keyLabel}>{field.label}</label>
      <div className={styles.keyInputRow}>
        <div className={styles.keyInputWrapper}>
          <input
            type={visible ? 'text' : 'password'}
            className={styles.keyInput}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={field.placeholder}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            className={styles.visToggle}
            onClick={() => setVisible(v => !v)}
            type="button"
            title={visible ? 'Hide' : 'Show'}
            aria-label={visible ? 'Hide key' : 'Show key'}
          >
            {visible ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            )}
          </button>
        </div>
        <button
          className={`${styles.saveKeyBtn} ${saved ? styles.saveKeyBtnSaved : ''}`}
          onClick={handleSave}
          disabled={!value.trim() || setIPC.loading}
        >
          {saved ? '✓ Saved' : 'Save'}
        </button>
        <button
          className={`${styles.testKeyBtn} ${testStatus === 'ok' ? styles.testKeyBtnOk : testStatus === 'fail' ? styles.testKeyBtnFail : ''}`}
          onClick={handleTest}
          disabled={!value.trim() || testStatus === 'testing'}
          type="button"
        >
          {testStatus === 'testing' ? '…' : testStatus === 'ok' ? '✓' : testStatus === 'fail' ? '✗' : 'Test'}
        </button>
      </div>
      {testStatus === 'ok' && modelCount !== null && (
        <div className={styles.modelCountBadge}>{modelCount} models available</div>
      )}
    </div>
  )
}

function LinkSection() {
  const [config, setConfig] = useState({ enabled: false, port: 7771, token: '' })
  const [running, setRunning] = useState(false)
  const [clientCount, setClientCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const getIPC = useIPC<'link:getConfig'>()
  const setIPC = useIPC<'link:setConfig'>()

  useEffect(() => {
    getIPC.invoke('link:getConfig').then(cfg => {
      setConfig({ enabled: cfg.enabled, port: cfg.port, token: cfg.token ?? '' })
      setRunning(cfg.running ?? false)
      setClientCount(cfg.clientCount ?? 0)
    }).catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useIPCEvent('link:statusChange', (status) => {
    setRunning(status.running)
    setClientCount(status.clientCount)
  })

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await setIPC.invoke('link:setConfig', {
        enabled: config.enabled,
        port: config.port,
        token: config.token || undefined,
      })
    } catch (err) {
      console.error('Failed to save link config:', err)
    }
    setSaving(false)
  }, [setIPC, config])

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Link</h2>
      <p className={styles.sectionDesc}>
        Expose terminal and swarm status over a WebSocket bridge for remote viewing.
      </p>
      <div className={styles.linkStatusBar}>
        <span className={`${styles.linkStatusDot} ${running ? styles.linkStatusDotOn : styles.linkStatusDotOff}`} />
        <span className={styles.linkStatusText}>
          {running ? `Running on port ${config.port} · ${clientCount} client${clientCount !== 1 ? 's' : ''}` : 'Stopped'}
        </span>
        {running && (
          <a
            className={styles.linkOpenClient}
            href={`http://localhost:${config.port}`}
            target="_blank"
            rel="noreferrer"
          >
            Open client ↗
          </a>
        )}
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Enable WebSocket bridge</label>
        <button
          type="button"
          className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
          onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
          aria-pressed={config.enabled}
        >
          <span className={styles.toggleThumb} />
        </button>
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Port</label>
        <input
          type="number"
          className={styles.fieldInput}
          value={config.port}
          min={1024}
          max={65535}
          onChange={e => setConfig(c => ({ ...c, port: Number(e.target.value) }))}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Shared token (optional)</label>
        <input
          type="password"
          className={styles.fieldInput}
          value={config.token}
          onChange={e => setConfig(c => ({ ...c, token: e.target.value }))}
          placeholder="Leave empty for no auth"
          autoComplete="off"
        />
      </div>
      <button
        className={styles.saveKeyBtn}
        onClick={handleSave}
        disabled={saving || setIPC.loading}
      >
        {saving ? 'Saving…' : 'Apply'}
      </button>
    </div>
  )
}

function SyncSection() {
  const [config, setConfig] = useState<{ enabled: boolean; endpoint: string; apiKey: string }>({
    enabled: false, endpoint: '', apiKey: '',
  })
  const [summary, setSummary] = useState<{
    lastSyncAt?: number; lastStatus: string; lastError?: string;
    itemsUploaded: number; itemsPending: number;
  }>({ lastStatus: 'idle', itemsUploaded: 0, itemsPending: 0 })
  const [syncing, setSyncing] = useState(false)
  const getConfigIPC = useIPC<'sync:getConfig'>()
  const setConfigIPC = useIPC<'sync:setConfig'>()
  const getSummaryIPC = useIPC<'sync:getSummary'>()
  const triggerIPC = useIPC<'sync:trigger'>()

  useEffect(() => {
    getConfigIPC.invoke('sync:getConfig').then(cfg => {
      setConfig({ enabled: cfg.enabled, endpoint: cfg.endpoint ?? '', apiKey: cfg.apiKey ?? '' })
    }).catch(console.error)
    getSummaryIPC.invoke('sync:getSummary').then(setSummary).catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useIPCEvent('sync:statusChange', (s: any) => setSummary(s))

  const handleSave = useCallback(async () => {
    try {
      await setConfigIPC.invoke('sync:setConfig', {
        enabled: config.enabled,
        endpoint: config.endpoint || undefined,
        apiKey: config.apiKey || undefined,
      })
    } catch (err) { console.error(err) }
  }, [setConfigIPC, config])

  const handleTrigger = useCallback(async () => {
    setSyncing(true)
    try {
      const result = await triggerIPC.invoke('sync:trigger')
      setSummary(result)
    } catch (err) { console.error(err) }
    setSyncing(false)
  }, [triggerIPC])

  const statusColor = summary.lastStatus === 'ok' ? '#3fb950'
    : summary.lastStatus === 'error' ? '#f85149'
    : summary.lastStatus === 'in-progress' ? '#f0a500'
    : '#888'

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Sync</h2>
      <p className={styles.sectionDesc}>
        Sync bench results, replay sessions, and guard runs to a remote backend.
        No network calls are made yet — this is scaffolding for a future cloud service.
      </p>

      <div className={styles.syncStatusCard}>
        <div className={styles.syncStatusRow}>
          <span className={styles.syncStatusDot} style={{ background: statusColor }} />
          <span className={styles.syncStatusLabel}>
            {summary.lastStatus === 'idle' && 'Never synced'}
            {summary.lastStatus === 'in-progress' && 'Syncing…'}
            {summary.lastStatus === 'ok' && `Last sync: ${summary.lastSyncAt ? new Date(summary.lastSyncAt).toLocaleTimeString() : '—'}`}
            {summary.lastStatus === 'error' && `Error: ${summary.lastError ?? 'unknown'}`}
          </span>
        </div>
        {summary.lastStatus === 'ok' && (
          <div className={styles.syncCounts}>
            <span>{summary.itemsUploaded} items uploaded</span>
            <span className={styles.syncSep}>·</span>
            <span>{summary.itemsPending} pending</span>
          </div>
        )}
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Enable Sync</label>
        <button
          type="button"
          className={`${styles.toggle} ${config.enabled ? styles.toggleOn : ''}`}
          onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
          aria-pressed={config.enabled}
        >
          <span className={styles.toggleThumb} />
        </button>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>API Key</label>
        <input
          type="password"
          className={styles.fieldInput}
          value={config.apiKey}
          onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))}
          placeholder="nx-…"
          autoComplete="off"
        />
      </div>

      <div className={styles.syncActions}>
        <button className={styles.saveKeyBtn} onClick={handleSave}>
          Save
        </button>
        <button
          className={`${styles.saveKeyBtn} ${styles.syncTriggerBtn}`}
          onClick={handleTrigger}
          disabled={syncing || summary.lastStatus === 'in-progress'}
        >
          {syncing ? 'Syncing…' : 'Trigger Sync'}
        </button>
      </div>
    </div>
  )
}

export function SettingsPanel() {
  const [activeSection, setActiveSection] = useState<Section>('api-keys')

  useEffect(() => {
    const handler = (e: Event) => {
      const section = (e as CustomEvent<string>).detail as Section
      if (section) setActiveSection(section)
    }
    window.addEventListener('nexus:settings-section', handler)
    return () => window.removeEventListener('nexus:settings-section', handler)
  }, [])

  return (
    <div className={styles.root}>
      {/* Sidebar nav */}
      <nav className={styles.nav}>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            className={`${styles.navItem} ${activeSection === s.id ? styles.navItemActive : ''}`}
            onClick={() => setActiveSection(s.id)}
          >
            <span className={styles.navLabel}>{s.label}</span>
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className={styles.content}>
        {activeSection === 'api-keys' && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>API Keys</h2>
            <p className={styles.sectionDesc}>
              Keys are stored securely in the system keychain and never written to disk.
            </p>
            <div className={styles.keyList}>
              {API_KEY_FIELDS.map(field => (
                <ApiKeyRow key={field.provider} field={field} />
              ))}
            </div>
          </div>
        )}

        {activeSection === 'models' && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Models</h2>
            <p className={styles.sectionDesc}>
              Configure model preferences and defaults. Available models depend on your API keys.
            </p>
            <div className={styles.placeholder}>
              <span>Configure model preferences after adding API keys above.</span>
            </div>
          </div>
        )}

        {activeSection === 'appearance' && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Appearance</h2>
            <p className={styles.sectionDesc}>
              Customize the look and feel of NexusMind.
            </p>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Theme</label>
              <div className={styles.themeOptions}>
              <div className={`${styles.themeOption} ${styles.themeOptionActive}`}>
                <div className={styles.themePreview} style={{ background: '#0d0d0d' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: '#7c6af7', margin: 4 }} />
                </div>
                <span className={styles.themeLabel}>Dark</span>
                <span className={styles.themeCheck}>✓</span>
              </div>
            </div>
            </div>
          </div>
        )}

        {activeSection === 'shortcuts' && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Keyboard Shortcuts</h2>
            <p className={styles.sectionDesc}>
              Global keyboard shortcuts for NexusMind.
            </p>
            <table className={styles.shortcutTable}>
              <tbody>
                {SHORTCUTS.map(s => (
                  <tr key={s.action} className={styles.shortcutRow}>
                    <td className={styles.shortcutAction}>{s.action}</td>
                    <td className={styles.shortcutKeys}>
                      {s.keys.map((key, i) => (
                        <React.Fragment key={i}>
                          <kbd className={styles.kbd}>{key}</kbd>
                          {i < s.keys.length - 1 && <span className={styles.kbdPlus}>+</span>}
                        </React.Fragment>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeSection === 'link' && <LinkSection />}

        {activeSection === 'sync' && <SyncSection />}

        {activeSection === 'about' && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>About NexusMind</h2>
            <div className={styles.aboutCard}>
              <div className={styles.aboutLogo}>
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="18" fill="rgba(124,106,247,0.15)" stroke="#7c6af7" strokeWidth="1.5"/>
                  <path d="M12 20l6 6 10-12" stroke="#7c6af7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className={styles.aboutInfo}>
                <div className={styles.aboutName}>NexusMind</div>
                <div className={styles.aboutVersion}>Version 0.0.1</div>
                <div className={styles.aboutDesc}>
                  AI-powered multi-agent development environment
                </div>
              </div>
            </div>
            <div className={styles.aboutMeta}>
              <div className={styles.aboutMetaRow}>
                <span className={styles.aboutMetaKey}>Runtime</span>
                <span className={styles.aboutMetaVal}>Electron 33 + React 19</span>
              </div>
              <div className={styles.aboutMetaRow}>
                <span className={styles.aboutMetaKey}>Platform</span>
                <span className={styles.aboutMetaVal}>{typeof navigator !== 'undefined' ? navigator.platform : 'Unknown'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
