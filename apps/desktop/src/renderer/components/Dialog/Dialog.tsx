import React, { useRef } from 'react'
import { useDialogFocusTrap } from './hooks/useDialogFocusTrap'
import styles from './Dialog.module.css'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const titleIdRef = useRef(`dialog-title-${Math.random().toString(36).slice(2)}`)
  const titleId = titleIdRef.current

  useDialogFocusTrap(containerRef, open, onClose)

  if (!open) return null

  return (
    <div className={styles.backdrop} ref={containerRef}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
