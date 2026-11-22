import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { effectById, type EffectFamily } from '../core/effects'
import { hsvToCss } from '../core/colors'
import { BOARD_KEYS, BOARD_UNITS } from '../core/layout'
import type { LightingTarget } from '../core/protocol'
import type { Lighting, ZoneLighting } from '../core/types'

const ANIMATED_FAMILIES: ReadonlySet<EffectFamily> = new Set(['wave', 'breathe', 'rain', 'reactive'])

const ZONE_CAPTION: Record<LightingTarget, string> = {
  keys: 'Editing key backlight (channel 3). Side panel shows its own live state (channel 2).',
  side: 'Editing side panel strip (channel 2). Key backlight shows its own live state (channel 3).',
  both: 'Editing both zones together. Each change is written to channel 3 and channel 2.',
}

function speedDurationSeconds(speed: number, family: EffectFamily): number {
  const ratio = Math.max(0, Math.min(255, speed)) / 255
  const base = family === 'breathe' ? 5.2 : family === 'rain' ? 3.2 : family === 'reactive' ? 3.8 : 4.2
  const min = family === 'breathe' ? 1.1 : 0.75
  return Number((base - ratio * (base - min)).toFixed(2))
}

function isLightingOff(lighting: Lighting, idle: boolean): boolean {
  if (idle) return true
  const effect = effectById(lighting.effect)
  return effect.family === 'off' || lighting.brightness === 0
}

interface KeyboardStageProps {
  zones: ZoneLighting
  /** No keyboard and no demo: render a neutral, unlit board. */
  idle: boolean
  /** Which zone the controls currently target. */
  target?: LightingTarget
  /** Show ANSI TKL keycap legends on the preview board. */
  showLegends?: boolean
}

export function KeyboardStage({
  zones,
  idle,
  target = 'keys',
  showLegends = false,
}: KeyboardStageProps) {
  const [pulseOrigin, setPulseOrigin] = useState<{ x: number; y: number; tick: number } | null>(null)
  const pulseTimer = useRef<number | null>(null)

  const keyLighting = zones.keys
  const sideLighting = zones.side
  const keyEffect = effectById(keyLighting.effect)
  const sideEffect = effectById(sideLighting.effect)

  const keysOff = isLightingOff(keyLighting, idle)
  const sideOff = isLightingOff(sideLighting, idle)
  const keysTargeted = target !== 'side'
  const sideTargeted = target !== 'keys'

  const triggerPulse = useCallback((x: number, y: number) => {
    setPulseOrigin({ x, y, tick: Date.now() })
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current)
    pulseTimer.current = window.setTimeout(() => {
      pulseTimer.current = null
      setPulseOrigin(null)
    }, 650)
  }, [])

  useEffect(() => {
    return () => {
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current)
    }
  }, [])

  useEffect(() => {
    if (idle || keyEffect.family !== 'reactive') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const match = BOARD_KEYS.find((item) => item.code === event.code)
      if (match) triggerPulse(match.x + match.w / 2, match.y + 0.5)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [idle, keyEffect.family, triggerPulse])

  const keyTone = useMemo(() => {
    return (index: number, x: number, y: number) => {
      if (keysOff) return 'rgba(255, 255, 255, 0.08)'
      const value = Math.max(keyLighting.value, 55)
      if (!keyEffect.usesColor) {
        const hue = Math.round((x * 13 + y * 29 + index * 3) % 256)
        return hsvToCss(hue, 215, value)
      }
      if (keyEffect.family === 'wave' && keyEffect.id >= 12 && keyEffect.id <= 22) {
        const hue = Math.round((keyLighting.hue + x * 14 + y * 18) % 256)
        return hsvToCss(hue, Math.max(keyLighting.saturation, 180), value)
      }
      return hsvToCss(keyLighting.hue, keyLighting.saturation, value)
    }
  }, [keyEffect.family, keyEffect.id, keyEffect.usesColor, keyLighting.hue, keyLighting.saturation, keyLighting.value, keysOff])

  const sideTone = useMemo(() => {
    if (sideOff) return { background: 'rgba(255, 255, 255, 0.08)', glow: 'transparent' }
    const value = Math.max(sideLighting.value, 55)
    if (sideEffect.usesColor && !(sideEffect.family === 'wave' && sideEffect.id >= 12 && sideEffect.id <= 22)) {
      const color = hsvToCss(sideLighting.hue, sideLighting.saturation, value)
      return { background: color, glow: color }
    }
    const baseHue = sideEffect.usesColor ? sideLighting.hue : 0
    const rainbow = `linear-gradient(180deg, ${hsvToCss(baseHue, 215, value)}, ${hsvToCss((baseHue + 85) % 256, 215, value)}, ${hsvToCss((baseHue + 170) % 256, 215, value)})`
    return { background: rainbow, glow: hsvToCss((baseHue + 85) % 256, 215, value) }
  }, [sideEffect.family, sideEffect.id, sideEffect.usesColor, sideLighting.hue, sideLighting.saturation, sideLighting.value, sideOff])

  const keyFamily = keysOff ? 'off' : keyEffect.family
  const keyAnimated = !keysOff && ANIMATED_FAMILIES.has(keyEffect.family)
  const sideAnimated = !sideOff && ANIMATED_FAMILIES.has(sideEffect.family)

  const keyLit = keysOff ? 0 : keyLighting.brightness / 255
  const sideLit = sideOff ? 0 : sideLighting.brightness / 255
  const boardOpacity = keysOff ? 0.55 : 0.48 + keyLit * 0.52
  const sideOpacity = sideOff ? 0.3 : 0.32 + sideLit * 0.68

  const keyDuration = `${speedDurationSeconds(keyLighting.speed, keyFamily)}s`
  const sideDuration = `${speedDurationSeconds(sideLighting.speed, sideOff ? 'off' : sideEffect.family)}s`

  const sidebar = (side: 'left' | 'right') => (
    <span
      className={`side-strip${sideOff ? '' : ' is-live'}${sideTargeted ? ' is-targeted' : ' is-secondary'}${sideAnimated ? ' is-animated' : ''}`}
      aria-hidden="true"
      style={{
        background: sideTone.background,
        opacity: sideOpacity,
        ['--side-glow' as string]: sideTone.glow,
        ['--anim-duration' as string]: sideDuration,
      }}
      data-side={side}
    />
  )

  return (
    <div className="stage">
      <div className="stage-frame">
        {sidebar('left')}
        <div
          className={`board is-${keyFamily}${keyAnimated ? ' is-animated' : ''}${keysTargeted ? ' is-targeted' : ' is-secondary'}${showLegends ? ' has-legends' : ''}`}
          style={{
            opacity: boardOpacity,
            ['--anim-duration' as string]: keyDuration,
          }}
        >
          {BOARD_KEYS.map((cap) => {
            const centerX = cap.x + cap.w / 2
            const centerY = cap.y + 0.5
            const dist = pulseOrigin
              ? Math.hypot(centerX - pulseOrigin.x, centerY - pulseOrigin.y)
              : null
            const isPulsed = dist !== null && dist <= 3.6
            return (
              <button
                key={cap.index}
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className={`board-cap${isPulsed ? ' is-pulsed' : ''}`}
                onClick={() => triggerPulse(centerX, centerY)}
                style={{
                  left: `calc(${(cap.x / BOARD_UNITS.width) * 100}% + 1px)`,
                  top: `calc(${(cap.y / BOARD_UNITS.height) * 100}% + 1px)`,
                  width: `calc(${(cap.w / BOARD_UNITS.width) * 100}% - 2px)`,
                  height: `calc(${(1 / BOARD_UNITS.height) * 100}% - 2px)`,
                  ['--tone' as string]: keyTone(cap.index, cap.x, cap.y),
                  ['--delay' as string]: `${(-(cap.x * 0.11 + cap.y * 0.19) % 2.6).toFixed(2)}s`,
                  ['--pulse-delay' as string]: dist !== null ? `${Math.round(dist * 45)}ms` : '0ms',
                }}
              >
                {showLegends ? <span className="cap-legend">{cap.label}</span> : null}
              </button>
            )
          })}
        </div>
        {sidebar('right')}
      </div>
      <p className="stage-caption">
        {idle
          ? 'No keyboard connected. The preview shows an unlit board.'
          : `${ZONE_CAPTION[target]} Keys: ${keyEffect.name} · Side: ${sideEffect.name}. The physical keyboard is the source of truth; this preview only approximates the effect.`}
      </p>
    </div>
  )
}
