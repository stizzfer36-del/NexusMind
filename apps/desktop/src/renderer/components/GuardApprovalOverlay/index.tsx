import React, { useCallback, useRef, useState } from 'react'
import { useIPC, useIPCEvent } from '../../hooks'
import { useDialogFocusTrap } from '../Dialog/hooks/useDialogFocusTrap'
import styles from './GuardApprovalOverlay.module.css'

interface ApprovalRequest {
  requestId: string
  action: string
  reason: string
  severity: string
}

export function GuardApprovalOverlay() {
  const [request, setRequest] = useState<ApprovalRequest | null>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const approvalResponseIPC = useIPC<'guard:approvalResponse'>()

  useIPCEvent(
    'guard:requestApproval',
    useCallback((payload: ApprovalRequest) => {
      console.log('[GuardApprovalOverlay] Received approval request:', payload)
      setRequest(payload)
    }, [])
  )

  const respond = useCallback(
    async (approved: boolean) => {
      if (!request) return
      try {
        await approvalResponseIPC.invoke('guard:approvalResponse', {
          requestId: request.requestId,
          approved,
        })
      } catch (e) {
        console.error('[GuardApprovalOverlay] Failed to send approval response:', e)
      }
      setRequest(null)
    },
    [request, approvalResponseIPC]
  )

  useDialogFocusTrap(backdropRef, !!request, () => respond(false))

  if (!request) return null

  const severityClass =
    request.severity === 'CRITICAL'
      ? styles.severityCritical
      : request.severity === 'HIGH'
        ? styles.severityHigh
        : request.severity === 'MEDIUM'
          ? styles.severityMedium
          : styles.severityLow

  return (
    <div className={styles.backdrop} ref={backdropRef} role="dialog" aria-modal="true" aria-label="Guard approval required">
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.shieldIcon}>⛨</span>
          <h2 className={styles.title}>Guard Approval Required</h2>
        </div>

        <div className={styles.body}>
          <div className={styles.actionRow}>
            <span className={styles.actionLabel}>Action:</span>
            <span className={styles.actionValue}>{request.action}</span>
          </div>

          <div className={`${styles.severityBadge} ${severityClass}`}>
            {request.severity}
          </div>

          <p className={styles.reason}>{request.reason}</p>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.rejectBtn}
            onClick={() => respond(false)}
            aria-label="Reject and cancel action"
          >
            Reject
          </button>
          <button
            className={styles.approveBtn}
            onClick={() => respond(true)}
            aria-label="Approve and continue"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}
