import { useCallback, useEffect, useRef, useState } from 'react'
import type { IpcEvents, IpcRendererEvents } from '@nexusmind/shared/ipc-channels'

export function useIPC<K extends keyof IpcEvents>() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const invoke = useCallback(
    async (
      channel: K,
      ...args: Parameters<IpcEvents[K]>
    ): Promise<ReturnType<IpcEvents[K]>> => {
      setLoading(true)
      setError(null)
      try {
        if (typeof window === 'undefined' || !window.electronAPI?.invoke) {
          console.error(`[useIPC] window.electronAPI not available. Channel: ${String(channel)}`)
          throw new Error(`IPC bridge not initialized [channel: ${String(channel)}]`)
        }
        const result = await window.electronAPI.invoke(channel, ...args)
        if (mountedRef.current) {
          setLoading(false)
        }
        return result
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setLoading(false)
        }
        throw err
      }
    },
    []
  )

  return { invoke, loading, error }
}

export function useIPCEvent<K extends keyof IpcRendererEvents>(
  channel: K,
  callback: IpcRendererEvents[K]
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.on) {
      console.error(`[useIPCEvent] window.electronAPI is undefined — preload did not load (channel: ${String(channel)})`)
      return
    }
    const unsubscribe = window.electronAPI.on(
      channel,
      ((...args: Parameters<IpcRendererEvents[K]>) => {
        ;(callbackRef.current as (...args: any[]) => void)(...args)
      }) as IpcRendererEvents[K]
    )
    return unsubscribe
  }, [channel])
}

export function useServiceHealth() {
  const [failedServices, setFailedServices] = useState<string[]>([])

  useIPCEvent('app:serviceHealth', useCallback((payload: { failed: string[] }) => {
    setFailedServices(payload.failed)
    if (payload.failed.length > 0) {
      console.warn('[ServiceHealth] Failed services:', payload.failed.join(', '))
    }
  }, []))

  return failedServices
}
