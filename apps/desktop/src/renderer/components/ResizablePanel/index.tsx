import React, { useCallback, useEffect, useRef, useState } from 'react'
import styles from './ResizablePanel.module.css'

interface ResizablePanelProps {
  children: React.ReactNode
  className?: string
  defaultSize: number
  minSize?: number
  maxSize?: number
  direction?: 'horizontal' | 'vertical'
  handlePosition?: 'start' | 'end'
  onResize?: (size: number) => void
}

export function ResizablePanel({
  children,
  className,
  defaultSize,
  minSize = 100,
  maxSize = 800,
  direction = 'horizontal',
  handlePosition = 'end',
  onResize,
}: ResizablePanelProps) {
  const [size, setSize] = useState(defaultSize)
  const isDragging = useRef(false)
  const startPos = useRef(0)
  const startSize = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY
    startSize.current = size
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [direction, size])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDragging.current) return
    const delta = direction === 'horizontal'
      ? e.clientX - startPos.current
      : e.clientY - startPos.current
    const adjustment = handlePosition === 'end' ? delta : -delta
    const newSize = Math.min(maxSize, Math.max(minSize, startSize.current + adjustment))
    setSize(newSize)
    onResize?.(newSize)
  }, [direction, handlePosition, minSize, maxSize, onResize])

  const handlePointerUp = useCallback(() => {
    isDragging.current = false
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [handlePointerMove, handlePointerUp])

  const sizeStyle = direction === 'horizontal'
    ? { width: size, flexShrink: 0 }
    : { height: size, flexShrink: 0 }

  const handle = (
    <div
      className={`${styles.handle} ${direction === 'horizontal' ? styles.handleHorizontal : styles.handleVertical}`}
      onPointerDown={handlePointerDown}
      role="separator"
      aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
    />
  )

  return (
    <div
      ref={containerRef}
      className={`${styles.panel} ${className ?? ''}`}
      style={sizeStyle}
    >
      {handlePosition === 'start' && handle}
      <div className={styles.content}>{children}</div>
      {handlePosition === 'end' && handle}
    </div>
  )
}
