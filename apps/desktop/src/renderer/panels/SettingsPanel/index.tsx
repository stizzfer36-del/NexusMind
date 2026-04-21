import React, { useCallback, useEffect, useState } from 'react'
import { useIPC } from '../../hooks'
import styles from './SettingsPanel.module.css'

type Section = 'api-keys' | 'models' | 'appearance' | 'shortcuts' | 'about'

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'api-keys', label: 'API Keys', icon: '🔑' },
  { id: 'models', label: 'Models', icon: '🤖' },
  { id: 'appearance', label: 'Appearance', icon: '🎨' },
  { id: 'shortcuts', label: 'Shortcuts', icon: '⌨️' },
  { id: 'about', label: 'About', icon: 'ℹ️' },
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
  { provider: 'ollama', label: 'Ollama Base URL', placeholder: 'http://localhost:11434' },
]

function ApiKeyRow({ field }: { field: ApiKeyField }) {
  const [value, setValue] = useState('')
  const [visible, setVisible] = useState(false)
  const [saved, setSaved] = useState(false)
  const getIPC = useIPC<'keychain:get'>()
  const setIPC = useIPC<'keychain:set'>()

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
      </div>
    </div>
  )
}

export function SettingsPanel() {
  const [activeSection, setActiveSection] = useState<Section>('api-keys')

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
            <span className={styles.navIcon}>{s.icon}</span>
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
              <span>Model configuration coming soon</span>
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
                <div className={`${styles.themeOption} ${styles.themeOptionDisabled}`}>
                  <div className={styles.themePreview} style={{ background: '#f8f8f8' }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: '#7c6af7', margin: 4 }} />
                  </div>
                  <span className={styles.themeLabel}>Light</span>
                  <span className={styles.themeSoon}>soon</span>
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
