import { useCallback, useEffect, useRef } from 'react'
import { effectById } from '../core/effects'
import {
  KEY_SAMPLE_POINTS,
  SIDE_SEGMENTS,
  buildSideSamplePoints,
  evaluateEffectRgb,
  type ReactiveHit,
} from '../core/effectEngine'
import { BOARD_KEYS, BOARD_UNITS } from '../core/layout'
import type { LightingTarget } from '../core/protocol'
import type { Lighting, ZoneLighting } from '../core/types'

const LEFT_SIDE_POINTS = buildSideSamplePoints('left')
const RIGHT_SIDE_POINTS = buildSideSamplePoints('right')

const ZONE_CAPTION: Record<LightingTarget, string> = {
  keys: 'Editing key backlight (channel 3). Side panel shows its own live state (channel 2).',
  side: 'Editing side panel strip (channel 2). Key backlight shows its own live state (channel 3).',
  both: 'Editing both zones together. Each change is written to channel 3 and channel 2.',
}

const FRAME_INTERVAL_MS = 33 // ~30 fps: smooth motion, low CPU
const MAX_HITS = 14

function isLightingOff(lighting: Lighting, idle: boolean): boolean {
  if (idle) return true
  const effect = effectById(lighting.effect)
  return effect.family === 'off' || lighting.brightness === 0
}

function isInteractiveEffect(effectId: number): boolean {
  return effectId === 31 || (effectId >= 33 && effectId <= 44)
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
  const capRefs = useRef<Array<HTMLButtonElement | null>>([])
  const leftLedRefs = useRef<Array<HTMLSpanElement | null>>([])
  const rightLedRefs = useRef<Array<HTMLSpanElement | null>>([])
  const leftStripRef = useRef<HTMLDivElement | null>(null)
  const rightStripRef = useRef<HTMLDivElement | null>(null)

  const zonesRef = useRef<ZoneLighting>(zones)
  const idleRef = useRef<boolean>(idle)
  const hitsRef = useRef<ReactiveHit[]>([])
  const lastUserHitAtRef = useRef<number>(-10)
  const lastAutoHitAtRef = useRef<number>(-10)
  const startTimeRef = useRef<number>(performance.now())

  zonesRef.current = zones
  idleRef.current = idle

  const keyEffect = effectById(zones.keys.effect)
  const sideEffect = effectById(zones.side.effect)
  const keysOff = isLightingOff(zones.keys, idle)
  const sideOff = isLightingOff(zones.side, idle)
  const keysTargeted = target !== 'side'
  const sideTargeted = target !== 'keys'

  const pushHit = useCallback((keyIndex: number, isUser: boolean) => {
    const point = KEY_SAMPLE_POINTS[keyIndex]
    if (!point) return
    const nowSec = (performance.now() - startTimeRef.current) / 1000
    if (isUser) lastUserHitAtRef.current = nowSec
    hitsRef.current = [
      { x: point.x, y: point.y, at: nowSec, keyIndex },
      ...hitsRef.current.filter((hit) => nowSec - hit.at < 5),
    ].slice(0, MAX_HITS)
  }, [])

  // Real keyboard presses drive reactive & heatmap effects directly on the preview
  useEffect(() => {
    if (idle) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const match = BOARD_KEYS.find((item) => item.code === event.code)
      if (match) pushHit(match.index, true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [idle, pushHit])

  // Real-time per-key & side-strip lighting renderer
  useEffect(() => {
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let rafId = 0
    let lastDraw = 0

    const paintFrame = (nowMs: number) => {
      const timeSec = reducedMotion ? 1.2 : (nowMs - startTimeRef.current) / 1000
      const currentIdle = idleRef.current
      const currentZones = zonesRef.current
      const currentKeysOff = isLightingOff(currentZones.keys, currentIdle)
      const currentSideOff = isLightingOff(currentZones.side, currentIdle)

      // Provide a gentle ambient demo hit for reactive/heatmap effects when the user
      // hasn't pressed a key recently, so browsing all 46 effects shows each animation live.
      if (
        !currentIdle &&
        !reducedMotion &&
        (isInteractiveEffect(currentZones.keys.effect) || isInteractiveEffect(currentZones.side.effect))
      ) {
        if (timeSec - lastUserHitAtRef.current > 2.8 && timeSec - lastAutoHitAtRef.current > 1.25) {
          lastAutoHitAtRef.current = timeSec
          const demoIndex = Math.floor((timeSec * 19) % BOARD_KEYS.length)
          pushHit(demoIndex, false)
        }
      }

      const hits = hitsRef.current

      // Paint 87 keycaps
      for (let i = 0; i < KEY_SAMPLE_POINTS.length; i += 1) {
        const el = capRefs.current[i]
        if (!el) continue
        if (currentKeysOff) {
          el.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
          el.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.10)'
          continue
        }
        const [r, g, b] = evaluateEffectRgb(currentZones.keys, KEY_SAMPLE_POINTS[i], timeSec, hits)
        const lum = (r + g + b) / 765
        const bg = `rgb(${r} ${g} ${b})`
        el.style.backgroundColor = bg
        el.style.boxShadow =
          lum > 0.15
            ? `inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 0 12px -4px rgb(${r} ${g} ${b} / 75%)`
            : 'inset 0 1px 0 rgba(255, 255, 255, 0.10)'
      }

      // Paint left & right side panel strips (channel 2)
      const paintSide = (
        points: typeof LEFT_SIDE_POINTS,
        refs: Array<HTMLSpanElement | null>,
        stripEl: HTMLDivElement | null,
      ) => {
        let sumR = 0
        let sumG = 0
        let sumB = 0
        for (let i = 0; i < points.length; i += 1) {
          const seg = refs[i]
          if (!seg) continue
          if (currentSideOff) {
            seg.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
            continue
          }
          const [r, g, b] = evaluateEffectRgb(currentZones.side, points[i], timeSec, hits)
          sumR += r
          sumG += g
          sumB += b
          seg.style.backgroundColor = `rgb(${r} ${g} ${b})`
        }
        if (stripEl) {
          if (currentSideOff) {
            stripEl.style.setProperty('--side-glow', 'transparent')
          } else {
            const avgR = Math.round(sumR / points.length)
            const avgG = Math.round(sumG / points.length)
            const avgB = Math.round(sumB / points.length)
            stripEl.style.setProperty('--side-glow', `rgb(${avgR} ${avgG} ${avgB})`)
          }
        }
      }

      paintSide(LEFT_SIDE_POINTS, leftLedRefs.current, leftStripRef.current)
      paintSide(RIGHT_SIDE_POINTS, rightLedRefs.current, rightStripRef.current)
    }

    const tick = (nowMs: number) => {
      if (nowMs - lastDraw >= FRAME_INTERVAL_MS) {
        lastDraw = nowMs
        paintFrame(nowMs)
      }
      if (!reducedMotion) {
        rafId = window.requestAnimationFrame(tick)
      }
    }

    paintFrame(performance.now())
    if (!reducedMotion) {
      rafId = window.requestAnimationFrame(tick)
    }

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId)
    }
  }, [pushHit])

  const renderStrip = (side: 'left' | 'right') => {
    const refList = side === 'left' ? leftLedRefs : rightLedRefs
    const stripRef = side === 'left' ? leftStripRef : rightStripRef
    return (
      <div
        ref={stripRef}
        className={`side-strip${sideOff ? '' : ' is-live'}${sideTargeted ? ' is-targeted' : ' is-secondary'}`}
        aria-hidden="true"
        data-side={side}
      >
        {Array.from({ length: SIDE_SEGMENTS }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              refList.current[i] = el
            }}
            className="side-led"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="stage">
      <div className="stage-frame">
        {renderStrip('left')}
        <div
          className={`board${keysOff ? ' is-off' : ''}${keysTargeted ? ' is-targeted' : ' is-secondary'}${showLegends ? ' has-legends' : ''}`}
        >
          {BOARD_KEYS.map((cap) => (
            <button
              key={cap.index}
              ref={(el) => {
                capRefs.current[cap.index] = el
              }}
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="board-cap"
              onClick={() => pushHit(cap.index, true)}
              style={{
                left: `calc(${(cap.x / BOARD_UNITS.width) * 100}% + 1px)`,
                top: `calc(${(cap.y / BOARD_UNITS.height) * 100}% + 1px)`,
                width: `calc(${(cap.w / BOARD_UNITS.width) * 100}% - 2px)`,
                height: `calc(${(1 / BOARD_UNITS.height) * 100}% - 2px)`,
              }}
            >
              {showLegends ? <span className="cap-legend">{cap.label}</span> : null}
            </button>
          ))}
        </div>
        {renderStrip('right')}
      </div>
      <p className="stage-caption">
        {idle
          ? 'No keyboard connected. The preview shows an unlit board.'
          : `${ZONE_CAPTION[target]} Keys: ${keyEffect.name} · Side: ${sideEffect.name}.${
              isInteractiveEffect(zones.keys.effect)
                ? ' Type or click any key on the preview to trigger the reactive pattern.'
                : ''
            } The physical keyboard is the source of truth; this preview approximates the effect.`}
      </p>
    </div>
  )
}
