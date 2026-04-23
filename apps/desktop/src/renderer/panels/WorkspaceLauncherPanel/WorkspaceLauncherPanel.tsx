import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button/Button'
import { useWorkspaceStore, type WorkspaceTemplate } from '../../stores/workspaceStore'
import styles from './WorkspaceLauncherPanel.module.css'

interface TemplateOption {
  id: WorkspaceTemplate
  name: string
  desc: string
  ascii: string[]
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'solo',
    name: 'Solo',
    desc: '1 terminal + agent panel',
    ascii: [
      '┌────────┐┌──┐',
      '│        ││A │',
      '│   T    ││  │',
      '│        ││  │',
      '└────────┘└──┘',
    ],
  },
  {
    id: 'pair',
    name: 'Pair',
    desc: '2×1 terminals + agent panel',
    ascii: [
      '┌────────┐┌──┐',
      '│   T1   ││A │',
      '├────────┤│  │',
      '│   T2   ││  │',
      '└────────┘└──┘',
    ],
  },
  {
    id: 'squad',
    name: 'Squad',
    desc: '2×2 terminals + agent panel',
    ascii: [
      '┌────┬────┐┌──┐',
      '│ T1 │ T2 ││A │',
      '├────┼────┤│  │',
      '│ T3 │ T4 ││  │',
      '└────┴────┘└──┘',
    ],
  },
  {
    id: 'swarm',
    name: 'Swarm',
    desc: '4×4 terminals + agent panel',
    ascii: [
      '┌┬┬┬┐┌──┐',
      '├┼┼┼┤│A │',
      '├┼┼┼┤│  │',
      '├┼┼┼┤│  │',
      '└┴┴┴┘└──┘',
    ],
  },
]

export function WorkspaceLauncherPanel() {
  const { setTemplate, setHasLaunched } = useWorkspaceStore()
  const [focusedIndex, setFocusedIndex] = useState(0)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  const launch = useCallback(
    (template: WorkspaceTemplate) => {
      setTemplate(template)
      setHasLaunched()
    },
    [setTemplate, setHasLaunched]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const cols = 2
      const total = TEMPLATES.length

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setFocusedIndex((prev) => (prev + 1 < total ? prev + 1 : prev))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setFocusedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : prev))
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((prev) => {
          const next = prev + cols
          return next < total ? next : prev
        })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((prev) => {
          const next = prev - cols
          return next >= 0 ? next : prev
        })
      } else if (e.key === 'Enter') {
        e.preventDefault()
        launch(TEMPLATES[focusedIndex].id)
      }
    },
    [focusedIndex, launch]
  )

  useEffect(() => {
    const el = cardRefs.current[focusedIndex]
    if (el) {
      el.focus()
    }
  }, [focusedIndex])

  return (
    <div className={styles.root} role="dialog" aria-modal="true" aria-label="Workspace launcher">
      <div className={styles.content}>
        <h1 className={styles.title}>Choose Workspace Layout</h1>
        <p className={styles.subtitle}>Select a template to launch your workspace</p>

        <div
          className={styles.grid}
          role="radiogroup"
          aria-label="Workspace templates"
          onKeyDown={handleKeyDown}
        >
          {TEMPLATES.map((template, i) => (
            <div
              key={template.id}
              ref={(el) => { cardRefs.current[i] = el }}
              className={`${styles.card} ${focusedIndex === i ? styles.cardFocused : ''}`}
              role="radio"
              aria-checked={focusedIndex === i}
              tabIndex={focusedIndex === i ? 0 : -1}
              onClick={() => setFocusedIndex(i)}
            >
              <div className={styles.preview} aria-hidden="true">
                <pre className={styles.ascii}>{template.ascii.join('\n')}</pre>
              </div>
              <div className={styles.info}>
                <h2 className={styles.name}>{template.name}</h2>
                <p className={styles.desc}>{template.desc}</p>
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={() => launch(template.id)}
              >
                Launch
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
