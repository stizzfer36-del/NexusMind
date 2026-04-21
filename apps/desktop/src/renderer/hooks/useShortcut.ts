import { useEffect, useRef } from 'react'

function parseCombo(combo: string): {
  key: string
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
} {
  const parts = combo.toLowerCase().split(/[+\-]/)
  return {
    key: parts[parts.length - 1].trim(),
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    meta: parts.includes('meta') || parts.includes('cmd'),
  }
}

export function useShortcut(combo: string, callback: () => void) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const parsed = parseCombo(combo)

    const handler = (event: KeyboardEvent) => {
      const keyMatch = event.key.toLowerCase() === parsed.key
      const ctrlMatch = event.ctrlKey === parsed.ctrl
      const shiftMatch = event.shiftKey === parsed.shift
      const altMatch = event.altKey === parsed.alt
      const metaMatch = event.metaKey === parsed.meta

      const ctrlOrMetaMatch =
        parsed.ctrl || parsed.meta
          ? (event.ctrlKey || event.metaKey) && !(parsed.ctrl && !event.ctrlKey) && !(parsed.meta && !event.metaKey)
          : !event.ctrlKey && !event.metaKey

      const modifiersOk =
        ctrlOrMetaMatch && shiftMatch && altMatch

      if (keyMatch && modifiersOk) {
        event.preventDefault()
        callbackRef.current()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [combo])
}
