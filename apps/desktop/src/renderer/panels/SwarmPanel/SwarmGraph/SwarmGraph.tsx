import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import type { SwarmNodeState, SwarmEdgeMessage } from '../../../stores/swarm.store'
import styles from './SwarmGraph.module.css'

// ─── Pipeline definition ────────────────────────────────────────────────────

const PIPELINE_ROLES = ['scout', 'architect', 'coordinator', 'builder', 'reviewer', 'tester', 'docwriter'] as const
type PipelineRole = typeof PIPELINE_ROLES[number]

const ROLE_META: Record<PipelineRole, { label: string; icon: string; color: string; bgColor: string; borderColor: string }> = {
  scout:       { label: 'Scout',       icon: '🔍', color: 'var(--swarm-scout, #60a5fa)',       bgColor: 'var(--swarm-scout-bg, rgba(96,165,250,0.12))',  borderColor: 'var(--swarm-scout-border, rgba(96,165,250,0.35))' },
  architect:   { label: 'Architect',   icon: '📐', color: 'var(--swarm-architect, #a78bfa)',    bgColor: 'var(--swarm-architect-bg, rgba(167,139,250,0.12))', borderColor: 'var(--swarm-architect-border, rgba(167,139,250,0.35))' },
  coordinator: { label: 'Coordinator', icon: '🎯', color: 'var(--swarm-coordinator, #f472b6)',   bgColor: 'var(--swarm-coordinator-bg, rgba(244,114,182,0.12))', borderColor: 'var(--swarm-coordinator-border, rgba(244,114,182,0.35))' },
  builder:     { label: 'Builder',     icon: '🔨', color: 'var(--swarm-builder, #fbbf24)',       bgColor: 'var(--swarm-builder-bg, rgba(251,191,36,0.12))',  borderColor: 'var(--swarm-builder-border, rgba(251,191,36,0.35))' },
  reviewer:    { label: 'Reviewer',    icon: '👁', color: 'var(--swarm-reviewer, #34d399)',      bgColor: 'var(--swarm-reviewer-bg, rgba(52,211,153,0.12))', borderColor: 'var(--swarm-reviewer-border, rgba(52,211,153,0.35))' },
  tester:      { label: 'Tester',      icon: '🧪', color: 'var(--swarm-tester, #f87171)',       bgColor: 'var(--swarm-tester-bg, rgba(248,113,113,0.12))',  borderColor: 'var(--swarm-tester-border, rgba(248,113,113,0.35))' },
  docwriter:   { label: 'DocWriter',   icon: '📝', color: 'var(--swarm-docwriter, #38bdf8)',     bgColor: 'var(--swarm-docwriter-bg, rgba(56,189,248,0.12))', borderColor: 'var(--swarm-docwriter-border, rgba(56,189,248,0.35))' },
}

const BACK_EDGES: Array<{ from: PipelineRole; to: PipelineRole; label: string; condition: string }> = [
  { from: 'reviewer', to: 'builder', label: 'rejected', condition: '!reviewPassed' },
  { from: 'tester',   to: 'builder', label: 'failed',   condition: '!testPassed' },
]

// ─── Layout constants ───────────────────────────────────────────────────────

const NODE_W = 140
const NODE_H = 72
const H_GAP = 56
const V_GAP = 100
const CANVAS_PAD_X = 60
const CANVAS_PAD_Y = 50

// ─── Status helpers ─────────────────────────────────────────────────────────

const STATUS_ICON: Record<string, string> = {
  idle: '',
  running: '⟳',
  completed: '✓',
  failed: '✗',
  waiting: '⏳',
}

// ─── Edge animation particles ───────────────────────────────────────────────

interface Particle {
  id: number
  progress: number
  speed: number
}

function useEdgeParticles(isActive: boolean, count: number = 3): Particle[] {
  const [particles, setParticles] = useState<Particle[]>([])
  const frameRef = useRef<number>(0)

  useEffect(() => {
    if (!isActive) {
      setParticles([])
      return
    }

    const initial: Particle[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      progress: i / count,
      speed: 0.003 + Math.random() * 0.002,
    }))
    setParticles(initial)

    let lastTime = performance.now()
    const animate = (time: number) => {
      const dt = time - lastTime
      lastTime = time
      setParticles(prev =>
        prev.map(p => ({
          ...p,
          progress: (p.progress + p.speed * dt) % 1,
        }))
      )
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [isActive, count])

  return particles
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function AgentNode({
  role,
  nodeState,
  isActive,
  isSelected,
  onClick,
}: {
  role: PipelineRole
  nodeState: SwarmNodeState
  isActive: boolean
  isSelected: boolean
  onClick: (role: string) => void
}) {
  const meta = ROLE_META[role]
  const status = nodeState.status
  const statusIcon = STATUS_ICON[status] ?? ''
  const hasFiles = nodeState.fileLocks.length > 0

  return (
    <button
      className={`${styles.node} ${isActive ? styles.nodeActive : ''} ${isSelected ? styles.nodeSelected : ''} ${styles[`node${status.charAt(0).toUpperCase()}${status.slice(1)}`] ?? ''}`}
      style={{
        ['--node-color' as string]: meta.color,
        ['--node-bg' as string]: meta.bgColor,
        ['--node-border' as string]: meta.borderColor,
      }}
      onClick={() => onClick(role)}
      title={`${meta.label} — ${status}`}
    >
      <div className={styles.nodeIcon}>{meta.icon}</div>
      <div className={styles.nodeContent}>
        <div className={styles.nodeLabel}>{meta.label}</div>
        <div className={styles.nodeStatus}>
          <span className={`${styles.statusDot} ${styles[`statusDot${status.charAt(0).toUpperCase()}${status.slice(1)}`] ?? ''}`} />
          <span className={styles.statusText}>{status}</span>
          {statusIcon && <span className={styles.statusIcon}>{statusIcon}</span>}
        </div>
      </div>
      {hasFiles && (
        <div className={styles.fileBadge} title={nodeState.fileLocks.join(', ')}>
          {nodeState.fileLocks.length} file{nodeState.fileLocks.length > 1 ? 's' : ''}
        </div>
      )}
    </button>
  )
}

function FlowEdge({
  fromPos,
  toPos,
  isActive,
  label,
}: {
  fromPos: { x: number; y: number }
  toPos: { x: number; y: number }
  isActive: boolean
  label?: string
}) {
  const particles = useEdgeParticles(isActive, 3)
  const x1 = fromPos.x + NODE_W
  const y1 = fromPos.y + NODE_H / 2
  const x2 = toPos.x
  const y2 = toPos.y + NODE_H / 2

  return (
    <g>
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        className={`${styles.edge} ${isActive ? styles.edgeActive : ''}`}
      />
      <circle cx={x2 - 4} cy={y2} r={3} className={styles.edgeArrow} />
      {isActive && particles.map(p => {
        const px = x1 + (x2 - x1) * p.progress
        const py = y1 + (y2 - y1) * p.progress
        return (
          <circle
            key={p.id}
            cx={px} cy={py} r={2.5}
            className={styles.edgeParticle}
          />
        )
      })}
      {label && (
        <text
          x={(x1 + x2) / 2}
          y={(y1 + y2) / 2 - 6}
          className={styles.edgeLabel}
        >
          {label}
        </text>
      )}
    </g>
  )
}

function BackEdge({
  fromPos,
  toPos,
  label,
  isActive,
}: {
  fromPos: { x: number; y: number }
  toPos: { x: number; y: number }
  label: string
  isActive: boolean
}) {
  const particles = useEdgeParticles(isActive, 2)
  const x1 = fromPos.x + NODE_W / 2
  const y1 = fromPos.y + NODE_H
  const x2 = toPos.x + NODE_W / 2
  const y2 = toPos.y + NODE_H

  const midY = Math.max(y1, y2) + 40
  const pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`

  return (
    <g>
      <path
        d={pathD}
        className={`${styles.backEdge} ${isActive ? styles.backEdgeActive : ''}`}
        fill="none"
      />
      {isActive && particles.map(p => {
        const t = p.progress
        const mt = 1 - t
        const px = mt*mt*mt*x1 + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t*x2
        const py = mt*mt*mt*y1 + 3*mt*mt*t*midY + 3*mt*t*t*midY + t*t*t*y2
        return (
          <circle
            key={p.id}
            cx={px} cy={py} r={2.5}
            className={styles.edgeParticle}
          />
        )
      })}
      <text
        x={(x1 + x2) / 2}
        y={midY + 14}
        className={styles.backEdgeLabel}
      >
        {label}
      </text>
    </g>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

interface SwarmGraphProps {
  nodeStates: Record<string, SwarmNodeState>
  activeNode: string | null
  selectedNodeId: string | null
  onNodeClick: (nodeId: string) => void
  edgeMessages: SwarmEdgeMessage[]
}

export function SwarmGraph({
  nodeStates,
  activeNode,
  selectedNodeId,
  onNodeClick,
}: SwarmGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({
          width: Math.max(600, entry.contentRect.width),
          height: Math.max(400, entry.contentRect.height),
        })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo(() => {
    const nodesPerRow = Math.min(4, PIPELINE_ROLES.length)
    const rows = Math.ceil(PIPELINE_ROLES.length / nodesPerRow)
    const positions: Record<string, { x: number; y: number }> = {}

    PIPELINE_ROLES.forEach((role, i) => {
      const row = Math.floor(i / nodesPerRow)
      const col = i % nodesPerRow
      const rowWidth = row < rows - 1
        ? nodesPerRow
        : PIPELINE_ROLES.length - row * nodesPerRow
      const offsetX = (dimensions.width - rowWidth * (NODE_W + H_GAP) + H_GAP) / 2
      positions[role] = {
        x: offsetX + col * (NODE_W + H_GAP),
        y: CANVAS_PAD_Y + row * (NODE_H + V_GAP),
      }
    })

    return positions
  }, [dimensions])

  const forwardEdges = useMemo(() => {
    const edges: Array<{ from: PipelineRole; to: PipelineRole }> = []
    for (let i = 0; i < PIPELINE_ROLES.length - 1; i++) {
      edges.push({ from: PIPELINE_ROLES[i], to: PIPELINE_ROLES[i + 1] })
    }
    return edges
  }, [])

  const handleNodeClick = useCallback((role: string) => {
    onNodeClick(role)
  }, [onNodeClick])

  const svgHeight = useMemo(() => {
    const maxY = Math.max(...Object.values(layout).map(p => p.y + NODE_H))
    return maxY + 120
  }, [layout])

  return (
    <div ref={containerRef} className={styles.container}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${dimensions.width} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glowStrong">
            <feGaussianBlur stdDeviation="6" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {forwardEdges.map(edge => {
          const fromPos = layout[edge.from]
          const toPos = layout[edge.to]
          if (!fromPos || !toPos) return null
          const isEdgeActive = activeNode === edge.to
          return (
            <FlowEdge
              key={`${edge.from}-${edge.to}`}
              fromPos={fromPos}
              toPos={toPos}
              isActive={isEdgeActive}
            />
          )
        })}

        {BACK_EDGES.map(edge => {
          const fromPos = layout[edge.from]
          const toPos = layout[edge.to]
          if (!fromPos || !toPos) return null
          const isBackEdgeActive = activeNode === edge.from
          return (
            <BackEdge
              key={`back-${edge.from}-${edge.to}`}
              fromPos={fromPos}
              toPos={toPos}
              label={edge.label}
              isActive={isBackEdgeActive}
            />
          )
        })}
      </svg>

      <div className={styles.nodesLayer}>
        {PIPELINE_ROLES.map(role => {
          const pos = layout[role]
          if (!pos) return null
          const nodeState = nodeStates[role] ?? { role, status: 'idle' as const, output: '', fileLocks: [], agentId: '', startedAt: null, completedAt: null }
          const isActive = activeNode === role
          const isSelected = selectedNodeId === role

          return (
            <div
              key={role}
              className={styles.nodeWrapper}
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                width: NODE_W,
              }}
            >
              <AgentNode
                role={role}
                nodeState={nodeState}
                isActive={isActive}
                isSelected={isSelected}
                onClick={handleNodeClick}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}