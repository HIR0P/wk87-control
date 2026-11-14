import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage, type LightingClient, type LightingTarget } from '../core/protocol'
import { DEFAULT_LIGHTING, type Lighting } from '../core/types'

export type LightingStatus = 'idle' | 'reading' | 'ready' | 'applying' | 'error'

const WRITE_DEBOUNCE_MS = 260

export interface LightingController {
  lighting: Lighting
  /** What the keyboard reports back after the last write. */
  echo: Lighting | null
  status: LightingStatus
  error: string | null
  update: (patch: Partial<Lighting>) => void
  refresh: () => void
}

export function useLighting(
  client: LightingClient | null,
  target: LightingTarget = 'keys',
): LightingController {
  const [lighting, setLighting] = useState<Lighting>(DEFAULT_LIGHTING)
  const [echo, setEcho] = useState<Lighting | null>(null)
  const [status, setStatus] = useState<LightingStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const clientRef = useRef<LightingClient | null>(client)
  const targetRef = useRef<LightingTarget>(target)
  const pending = useRef<Partial<Lighting>>({})
  const timer = useRef<number | null>(null)

  clientRef.current = client
  targetRef.current = target

  const flush = useCallback(async () => {
    const active = clientRef.current
    const batch = pending.current
    pending.current = {}
    if (!active || Object.keys(batch).length === 0) return

    try {
      await active.writeLighting(targetRef.current, batch)
      if (Object.keys(pending.current).length === 0) {
        const confirmed = await active.readLighting(targetRef.current)
        setEcho(confirmed)
        setStatus('ready')
      }
      setError(null)
    } catch (writeError) {
      setError(errorMessage(writeError))
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    pending.current = {}
    if (timer.current) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    setEcho(null)
    setError(null)

    if (!client) {
      setStatus('idle')
      return
    }

    let cancelled = false
    setStatus('reading')
    client
      .readLighting(target)
      .then((state) => {
        if (cancelled) return
        setLighting(state)
        setEcho(state)
        setStatus('ready')
      })
      .catch((readError: unknown) => {
        if (cancelled) return
        setError(errorMessage(readError))
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [client, target])

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  const update = useCallback(
    (patch: Partial<Lighting>) => {
      setLighting((previous) => ({ ...previous, ...patch }))
      if (!clientRef.current) return

      pending.current = { ...pending.current, ...patch }
      if (timer.current) window.clearTimeout(timer.current)
      setStatus('applying')
      setError(null)
      timer.current = window.setTimeout(() => {
        timer.current = null
        void flush()
      }, WRITE_DEBOUNCE_MS)
    },
    [flush],
  )

  const refresh = useCallback(() => {
    const active = clientRef.current
    if (!active) return
    setStatus('reading')
    active
      .readLighting(targetRef.current)
      .then((state) => {
        setLighting(state)
        setEcho(state)
        setStatus('ready')
        setError(null)
      })
      .catch((readError: unknown) => {
        setError(errorMessage(readError))
        setStatus('error')
      })
  }, [])

  return { lighting, echo, status, error, update, refresh }
}
