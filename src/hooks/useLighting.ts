import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage, type LightingClient, type LightingTarget, type LightingZone } from '../core/protocol'
import { DEFAULT_ZONE_LIGHTING, type Lighting, type ZoneLighting } from '../core/types'

export type LightingStatus = 'idle' | 'reading' | 'ready' | 'applying' | 'error'

const WRITE_DEBOUNCE_MS = 260
const UNDO_BURST_MS = 1200
const MAX_HISTORY = 24

export interface LightingController {
  /** Active zone's lighting (keys when target is "keys" or "both", side when "side"). */
  lighting: Lighting
  /** Live state of both verified channels (ch. 3 keys, ch. 2 side). */
  zones: ZoneLighting
  /** What the keyboard reported back for the active zone after the last write. */
  echo: Lighting | null
  /** Readback values per channel. */
  echoZones: Partial<Record<LightingZone, Lighting>>
  status: LightingStatus
  error: string | null
  lastLatencyMs: number | null
  canUndo: boolean
  isOff: boolean
  update: (patch: Partial<Lighting>) => void
  applyZones: (next: Partial<ZoneLighting>) => void
  mirrorZone: (from: LightingZone, to: LightingZone) => void
  togglePower: () => void
  undo: () => void
  refresh: () => void
  ping: () => Promise<number | null>
}

function cloneZones(zones: ZoneLighting): ZoneLighting {
  return {
    keys: { ...zones.keys },
    side: { ...zones.side },
  }
}

function isZoneOff(lighting: Lighting): boolean {
  return lighting.effect === 0 || lighting.effect === 45 || lighting.brightness === 0
}

export function useLighting(
  client: LightingClient | null,
  target: LightingTarget = 'keys',
): LightingController {
  const [zones, setZones] = useState<ZoneLighting>(() => cloneZones(DEFAULT_ZONE_LIGHTING))
  const [echoZones, setEchoZones] = useState<Partial<Record<LightingZone, Lighting>>>({})
  const [status, setStatus] = useState<LightingStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null)
  const [history, setHistory] = useState<ZoneLighting[]>([])

  const clientRef = useRef<LightingClient | null>(client)
  const targetRef = useRef<LightingTarget>(target)
  const zonesRef = useRef<ZoneLighting>(zones)
  const pendingRef = useRef<{ keys: Partial<Lighting>; side: Partial<Lighting> }>({ keys: {}, side: {} })
  const timerRef = useRef<number | null>(null)
  const lastUndoPushRef = useRef<number>(0)
  const savedBeforeOffRef = useRef<Partial<Record<LightingZone, Lighting>>>({})

  clientRef.current = client
  targetRef.current = target
  zonesRef.current = zones

  const pushHistory = useCallback((snapshot: ZoneLighting, force = false) => {
    const now = Date.now()
    if (!force && now - lastUndoPushRef.current < UNDO_BURST_MS) return
    lastUndoPushRef.current = now
    setHistory((prev) => [cloneZones(snapshot), ...prev].slice(0, MAX_HISTORY))
  }, [])

  const hasPending = () =>
    Object.keys(pendingRef.current.keys).length > 0 || Object.keys(pendingRef.current.side).length > 0

  const flush = useCallback(async () => {
    const active = clientRef.current
    const batchKeys = pendingRef.current.keys
    const batchSide = pendingRef.current.side
    pendingRef.current = { keys: {}, side: {} }

    const writeKeys = Object.keys(batchKeys).length > 0
    const writeSide = Object.keys(batchSide).length > 0
    if (!active || (!writeKeys && !writeSide)) return

    const started = performance.now()
    try {
      if (writeKeys && writeSide && JSON.stringify(batchKeys) === JSON.stringify(batchSide)) {
        await active.writeLighting('both', batchKeys)
      } else {
        if (writeKeys) await active.writeLighting('keys', batchKeys)
        if (writeSide) await active.writeLighting('side', batchSide)
      }

      if (!hasPending()) {
        const nextEcho: Partial<Record<LightingZone, Lighting>> = {}
        if (writeKeys) nextEcho.keys = await active.readLighting('keys')
        if (writeSide) nextEcho.side = await active.readLighting('side')
        setEchoZones((prev) => ({ ...prev, ...nextEcho }))
        setLastLatencyMs(Math.max(0, Math.round(performance.now() - started)))
        setStatus('ready')
      }
      setError(null)
    } catch (writeError) {
      setError(errorMessage(writeError))
      setStatus('error')
    }
  }, [])

  const scheduleFlush = useCallback(
    (delayMs = WRITE_DEBOUNCE_MS) => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      setStatus('applying')
      setError(null)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        void flush()
      }, delayMs)
    },
    [flush],
  )

  useEffect(() => {
    pendingRef.current = { keys: {}, side: {} }
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setEchoZones({})
    setError(null)
    setHistory([])
    setLastLatencyMs(null)
    savedBeforeOffRef.current = {}

    if (!client) {
      setStatus('idle')
      return
    }

    let cancelled = false
    setStatus('reading')
    const started = performance.now()
    client
      .readAllZones()
      .then((both) => {
        if (cancelled) return
        setZones(cloneZones(both))
        setEchoZones(cloneZones(both))
        setLastLatencyMs(Math.max(0, Math.round(performance.now() - started)))
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
  }, [client])

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const update = useCallback(
    (patch: Partial<Lighting>) => {
      const currentTarget = targetRef.current
      const affectedZones: LightingZone[] = currentTarget === 'both' ? ['keys', 'side'] : [currentTarget]

      pushHistory(zonesRef.current)
      setZones((previous) => {
        const next = cloneZones(previous)
        for (const zone of affectedZones) {
          next[zone] = { ...next[zone], ...patch }
        }
        return next
      })

      if (!clientRef.current) return
      for (const zone of affectedZones) {
        pendingRef.current[zone] = { ...pendingRef.current[zone], ...patch }
      }
      scheduleFlush()
    },
    [pushHistory, scheduleFlush],
  )

  const applyZones = useCallback(
    (nextPatch: Partial<ZoneLighting>) => {
      const hasKeys = Boolean(nextPatch.keys)
      const hasSide = Boolean(nextPatch.side)
      if (!hasKeys && !hasSide) return

      pushHistory(zonesRef.current, true)
      setZones((previous) => ({
        keys: nextPatch.keys ? { ...nextPatch.keys } : { ...previous.keys },
        side: nextPatch.side ? { ...nextPatch.side } : { ...previous.side },
      }))

      if (!clientRef.current) return
      if (nextPatch.keys) pendingRef.current.keys = { ...pendingRef.current.keys, ...nextPatch.keys }
      if (nextPatch.side) pendingRef.current.side = { ...pendingRef.current.side, ...nextPatch.side }
      scheduleFlush(60)
    },
    [pushHistory, scheduleFlush],
  )

  const mirrorZone = useCallback(
    (from: LightingZone, to: LightingZone) => {
      if (from === to) return
      const source = zonesRef.current[from]
      applyZones({ [to]: { ...source } })
    },
    [applyZones],
  )

  const togglePower = useCallback(() => {
    const currentTarget = targetRef.current
    const affected: LightingZone[] = currentTarget === 'both' ? ['keys', 'side'] : [currentTarget]
    const allOff = affected.every((zone) => isZoneOff(zonesRef.current[zone]))
    const nextPatch: Partial<ZoneLighting> = {}

    if (allOff) {
      for (const zone of affected) {
        const remembered = savedBeforeOffRef.current[zone]
        const fallback = DEFAULT_ZONE_LIGHTING[zone]
        nextPatch[zone] = remembered
          ? { ...remembered }
          : {
              ...zonesRef.current[zone],
              effect: zonesRef.current[zone].effect === 0 || zonesRef.current[zone].effect === 45 ? fallback.effect : zonesRef.current[zone].effect,
              brightness: zonesRef.current[zone].brightness === 0 ? fallback.brightness : zonesRef.current[zone].brightness,
            }
      }
    } else {
      for (const zone of affected) {
        if (!isZoneOff(zonesRef.current[zone])) {
          savedBeforeOffRef.current[zone] = { ...zonesRef.current[zone] }
        }
        nextPatch[zone] = { ...zonesRef.current[zone], effect: 0 }
      }
    }

    applyZones(nextPatch)
  }, [applyZones])

  const undo = useCallback(() => {
    const [previous, ...rest] = history
    if (!previous) return
    setHistory(rest)
    lastUndoPushRef.current = 0
    setZones(cloneZones(previous))

    if (!clientRef.current) return
    pendingRef.current = {
      keys: { ...previous.keys },
      side: { ...previous.side },
    }
    scheduleFlush(60)
  }, [history, scheduleFlush])

  const refresh = useCallback(() => {
    const active = clientRef.current
    if (!active) return
    setStatus('reading')
    const started = performance.now()
    active
      .readAllZones()
      .then((both) => {
        setZones(cloneZones(both))
        setEchoZones(cloneZones(both))
        setLastLatencyMs(Math.max(0, Math.round(performance.now() - started)))
        setStatus('ready')
        setError(null)
      })
      .catch((readError: unknown) => {
        setError(errorMessage(readError))
        setStatus('error')
      })
  }, [])

  const ping = useCallback(async (): Promise<number | null> => {
    const active = clientRef.current
    if (!active) return null
    try {
      const ms = await active.ping()
      setLastLatencyMs(ms)
      setError(null)
      return ms
    } catch (pingError) {
      setError(errorMessage(pingError))
      return null
    }
  }, [])

  const activeZone: LightingZone = target === 'side' ? 'side' : 'keys'
  const lighting = zones[activeZone]
  const echo = echoZones[activeZone] ?? null
  const affected: LightingZone[] = target === 'both' ? ['keys', 'side'] : [target]
  const isOff = affected.every((zone) => isZoneOff(zones[zone]))

  return {
    lighting,
    zones,
    echo,
    echoZones,
    status,
    error,
    lastLatencyMs,
    canUndo: history.length > 0,
    isOff,
    update,
    applyZones,
    mirrorZone,
    togglePower,
    undo,
    refresh,
    ping,
  }
}
