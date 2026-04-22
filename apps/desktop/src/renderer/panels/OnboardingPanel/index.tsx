import React, { useCallback, useState } from 'react'
import { useIPC } from '../../hooks'
import styles from './OnboardingPanel.module.css'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ModelOption {
  id: string
  name: string
  desc: string
  badge?: string
}

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', desc: 'Balanced power', badge: 'Recommended' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', desc: 'Fast responses' },
  { id: 'gpt-4o', name: 'GPT-4o', desc: 'OpenAI flagship' },
  { id: 'llama3', name: 'Llama 3', desc: 'Runs locally' },
]

// ─── Logo SVG ────────────────────────────────────────────────────────────────

function LogoMark() {
  return (
    <div className={styles.logoCircle}>
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <circle cx="18" cy="18" r="14" stroke="#7c6af7" strokeWidth="1.5" fill="none" />
        <path d="M20 8L13 19h6l-3 9 10-13h-6l3-7z" fill="#7c6af7" stroke="none" />
      </svg>
    </div>
  )
}

// ─── Progress dots ────────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className={styles.steps} role="progressbar" aria-valuenow={current} aria-valuemin={1} aria-valuemax={total}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`${styles.dot} ${i + 1 === current ? styles.dotActive : ''}`} />
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface OnboardingPanelProps {
  onComplete: () => void
}

export function OnboardingPanel({ onComplete }: OnboardingPanelProps) {
  const [step, setStep] = useState(1)
  const [workspacePath, setWorkspacePath] = useState('')
  const [apiKeys, setApiKeys] = useState({
    openai: '',
    anthropic: '',
    ollama: 'http://localhost:11434',
  })
  const [defaultModel, setDefaultModel] = useState('claude-sonnet-4-6')
  const [saving, setSaving] = useState(false)

  const keychainSet = useIPC<'keychain:set'>()
  const settingsSet = useIPC<'settings:set'>()
  const dialogOpen = useIPC<'dialog:openDirectory'>()

  // ── Step 2: pick workspace folder ───────────────────────────────────────────
  const handlePickWorkspace = useCallback(async () => {
    try {
      const result = await dialogOpen.invoke('dialog:openDirectory')
      if (result) setWorkspacePath(result)
    } catch (err) {
      console.error('OnboardingPanel: failed to open directory dialog', err)
    }
  }, [dialogOpen])

  const handleSaveWorkspace = useCallback(async () => {
    try {
      await settingsSet.invoke('settings:set', { key: 'workspacePath', value: workspacePath })
    } catch (err) {
      console.error('OnboardingPanel: failed to save workspacePath', err)
    }
    setStep(3)
  }, [settingsSet, workspacePath])

  // ── Step 3: save API keys ──────────────────────────────────────────────────
  const handleSaveKeys = useCallback(async () => {
    const saves: Promise<unknown>[] = []

    if (apiKeys.openai.trim()) {
      saves.push(keychainSet.invoke('keychain:set', 'openai', apiKeys.openai.trim()))
    }
    if (apiKeys.anthropic.trim()) {
      saves.push(keychainSet.invoke('keychain:set', 'anthropic', apiKeys.anthropic.trim()))
    }
    if (apiKeys.ollama.trim()) {
      saves.push(settingsSet.invoke('settings:set', { key: 'ollamaUrl', value: apiKeys.ollama.trim() }))
    }

    try {
      await Promise.all(saves)
    } catch (err) {
      console.error('OnboardingPanel: failed to save keys', err)
    }

    setStep(4)
  }, [keychainSet, settingsSet, apiKeys])

  // ── Step 4: save default model ──────────────────────────────────────────────
  const handleSaveModel = useCallback(async () => {
    try {
      await settingsSet.invoke('settings:set', { key: 'defaultModel', value: defaultModel })
    } catch (err) {
      console.error('OnboardingPanel: failed to save model', err)
    }
    setStep(5)
  }, [settingsSet, defaultModel])

  // ── Step 5: finish onboarding ───────────────────────────────────────────────
  const handleLaunch = useCallback(async () => {
    setSaving(true)
    try {
      await settingsSet.invoke('settings:set', { key: 'onboardingComplete', value: true })
    } catch (err) {
      console.error('OnboardingPanel: failed to persist onboardingComplete', err)
    }
    onComplete()
  }, [settingsSet, onComplete])

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <StepDots current={step} total={5} />

        {/* ── Step 1: Welcome ─────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <div className={styles.logo}>
              <LogoMark />
            </div>
            <h1 className={styles.title}>NexusMind</h1>
            <p className={styles.subtitle}>Your AI Swarm IDE</p>
            <p className={styles.desc}>
              NexusMind orchestrates teams of AI agents to tackle complex
              development tasks. Set up your workspace to get started.
            </p>
            <div className={`${styles.btnRow} ${styles.btnRowCenter}`}>
              <button
                className={styles.btnPrimary}
                onClick={() => setStep(2)}
                style={{ maxWidth: 200 }}
              >
                Get Started
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Workspace Path ──────────────────────────────────── */}
        {step === 2 && (
          <>
            <h2 className={styles.stepTitle}>Choose Workspace</h2>
            <p className={styles.stepSubtitle}>Select a folder where your projects will live</p>

            <div className={styles.apiKeyGroup}>
              <label className={styles.apiKeyLabel} htmlFor="workspace-path">Workspace Folder</label>
              <input
                id="workspace-path"
                type="text"
                className={styles.apiKeyInput}
                placeholder="/path/to/workspace"
                value={workspacePath}
                onChange={e => setWorkspacePath(e.target.value)}
                readOnly
              />
            </div>

            <div className={`${styles.btnRow} ${styles.btnRowCenter}`} style={{ marginBottom: 28 }}>
              <button
                className={styles.btnSecondary}
                onClick={handlePickWorkspace}
                disabled={dialogOpen.loading}
              >
                {dialogOpen.loading ? 'Opening…' : 'Browse…'}
              </button>
            </div>

            <div className={styles.btnRow}>
              <button className={styles.btnSecondary} onClick={() => setStep(1)}>Back</button>
              <button
                className={styles.btnPrimary}
                onClick={handleSaveWorkspace}
                disabled={!workspacePath || settingsSet.loading}
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: API Keys ─────────────────────────────────────────── */}
        {step === 3 && (
          <>
            <h2 className={styles.stepTitle}>Add API Keys</h2>
            <p className={styles.stepSubtitle}>Keys are stored securely in the system keychain</p>

            <div className={styles.apiKeyGroup}>
              <label className={styles.apiKeyLabel} htmlFor="key-openai">OpenAI API Key</label>
              <input
                id="key-openai"
                type="password"
                className={styles.apiKeyInput}
                placeholder="sk-..."
                value={apiKeys.openai}
                onChange={e => setApiKeys(prev => ({ ...prev, openai: e.target.value }))}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className={styles.apiKeyGroup}>
              <label className={styles.apiKeyLabel} htmlFor="key-anthropic">Anthropic API Key</label>
              <input
                id="key-anthropic"
                type="password"
                className={styles.apiKeyInput}
                placeholder="sk-ant-..."
                value={apiKeys.anthropic}
                onChange={e => setApiKeys(prev => ({ ...prev, anthropic: e.target.value }))}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className={styles.apiKeyGroup}>
              <label className={styles.apiKeyLabel} htmlFor="key-ollama">Ollama URL</label>
              <input
                id="key-ollama"
                type="text"
                className={styles.apiKeyInput}
                placeholder="http://localhost:11434"
                value={apiKeys.ollama}
                onChange={e => setApiKeys(prev => ({ ...prev, ollama: e.target.value }))}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className={styles.btnRow}>
              <button className={styles.btnSecondary} onClick={() => setStep(2)}>Back</button>
              <button
                className={styles.btnPrimary}
                onClick={handleSaveKeys}
                disabled={keychainSet.loading || settingsSet.loading}
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* ── Step 4: Default Model ────────────────────────────────────── */}
        {step === 4 && (
          <>
            <h2 className={styles.stepTitle}>Choose Default Model</h2>
            <p className={styles.stepSubtitle}>This model will be used for agent tasks by default</p>

            <div className={styles.modelGrid}>
              {MODEL_OPTIONS.map(model => (
                <button
                  key={model.id}
                  className={`${styles.modelCard} ${defaultModel === model.id ? styles.modelCardActive : ''}`}
                  onClick={() => setDefaultModel(model.id)}
                  type="button"
                >
                  <span className={styles.modelCardName}>{model.name}</span>
                  <span className={styles.modelCardDesc}>{model.desc}</span>
                  {model.badge && <span className={styles.modelCardBadge}>{model.badge}</span>}
                </button>
              ))}
            </div>

            <div className={styles.btnRow}>
              <button className={styles.btnSecondary} onClick={() => setStep(3)}>Back</button>
              <button
                className={styles.btnPrimary}
                onClick={handleSaveModel}
                disabled={settingsSet.loading}
              >
                Next
              </button>
            </div>
          </>
        )}

        {/* ── Step 5: Done ─────────────────────────────────────────────── */}
        {step === 5 && (
          <>
            <h2 className={styles.stepTitle} style={{ textAlign: 'center' }}>You're all set!</h2>
            <p className={styles.stepSubtitle} style={{ textAlign: 'center', marginBottom: 24 }}>
              NexusMind is ready. Start by creating a swarm session to tackle your first development goal.
            </p>

            <div className={styles.featList}>
              <div className={styles.featItem}>
                <span className={styles.featIcon}>⚡</span>
                <span>Multi-agent swarms tackle complex tasks concurrently</span>
              </div>
              <div className={styles.featItem}>
                <span className={styles.featIcon}>📋</span>
                <span>Kanban board tracks task progress in real time</span>
              </div>
              <div className={styles.featItem}>
                <span className={styles.featIcon}>🧠</span>
                <span>Memory system retains context across sessions</span>
              </div>
            </div>

            <div className={`${styles.btnRow} ${styles.btnRowCenter}`}>
              <button
                className={styles.btnPrimary}
                onClick={handleLaunch}
                disabled={saving}
                style={{ maxWidth: 200 }}
              >
                {saving ? 'Launching…' : 'Launch NexusMind'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
