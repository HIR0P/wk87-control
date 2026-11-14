import { useMemo } from 'react'
import { effectById, type EffectFamily } from '../core/effects'
import { hsvToCss } from '../core/colors'
import { BOARD_ROWS, BOARD_UNITS } from '../core/layout'
import type { LightingTarget } from '../core/protocol'
import type { Lighting } from '../core/types'

interface Cap {
  index: number
  x: number
  y: number
  w: number
}

const CAPS: Cap[] = (() => {
  const caps: Cap[] = []
  let index = 0
  for (const row of BOARD_ROWS) {
    let x = 0
    for (const item of row.items) {
      if (item.kind === 'gap') {
        x += item.w
        continue
      }
      caps.push({ index, x, y: row.y, w: item.w })
      index += 1
      x += item.w
    }
  }
  return caps
})()

const ANIMATED_FAMILIES: ReadonlySet<EffectFamily> = new Set(['wave', 'breathe', 'rain', 'reactive'])

const ZONE_CAPTION: Record<LightingTarget, string> = {
  keys: 'Showing the key backlight (firmware channel 3).',
  side: 'Showing the side panel strip (firmware channel 2). The key backlight is untouched.',
  both: 'Showing both zones. The same values are written to the keys and the side panel.',
}

interface KeyboardStageProps {
  lighting: Lighting
  /** No keyboard and no demo: render a neutral, unlit board. */
  idle: boolean
  /** Which zone the controls currently target. */
  target?: LightingTarget
}

export function KeyboardStage({ lighting, idle, target = 'both' }: KeyboardStageProps) {
  const effect = effectById(lighting.effect)
  const off = idle || effect.family === 'off'
  const showKeys = target !== 'side'
  const showSide = target !== 'keys'

  const tone = useMemo(() => {
    return (index: number) => {
      if (off) return 'rgba(255, 255, 255, 0.08)'
      const hue = effect.usesColor ? lighting.hue : (index * 37) % 256
      const saturation = effect.usesColor ? lighting.saturation : 210
      const value = Math.max(lighting.value, 55)
      return hsvToCss(hue, saturation, value)
    }
  }, [effect.usesColor, lighting.hue, lighting.saturation, lighting.value, off])

  const sideTone = useMemo(() => {
    if (off) return { background: 'rgba(255, 255, 255, 0.08)', glow: 'transparent' }
    const value = Math.max(lighting.value, 55)
    if (effect.usesColor) {
      const color = hsvToCss(lighting.hue, lighting.saturation, value)
      return { background: color, glow: color }
    }
    const rainbow = `linear-gradient(180deg, ${hsvToCss(0, 210, value)}, ${hsvToCss(90, 210, value)}, ${hsvToCss(180, 210, value)})`
    return { background: rainbow, glow: hsvToCss(90, 210, value) }
  }, [effect.usesColor, lighting.hue, lighting.saturation, lighting.value, off])

  const family = off ? 'off' : effect.family
  const animated = !off && ANIMATED_FAMILIES.has(effect.family)
  const lit = off ? 0 : lighting.brightness / 255
  const boardOpacity = off ? 0.55 : 0.55 + lit * 0.45
  const sideOpacity = off ? 0.3 : 0.3 + lit * 0.7

  const sidebar = (side: 'left' | 'right') => (
    <span
      className={`side-strip${showSide ? ' is-live' : ' is-dim'}`}
      aria-hidden="true"
      style={{
        background: sideTone.background,
        opacity: sideOpacity,
        ['--side-glow' as string]: sideTone.glow,
      }}
      data-side={side}
    />
  )

  return (
    <div className="stage">
      <div className="stage-frame">
        {sidebar('left')}
        <div
          className={`board is-${family}${animated ? ' is-animated' : ''}`}
          aria-hidden="true"
          style={{ opacity: showKeys ? boardOpacity : 0.22 }}
        >
          {CAPS.map((cap) => (
            <div
              key={cap.index}
              className="board-cap"
              style={{
                left: `calc(${(cap.x / BOARD_UNITS.width) * 100}% + 1px)`,
                top: `calc(${(cap.y / BOARD_UNITS.height) * 100}% + 1px)`,
                width: `calc(${(cap.w / BOARD_UNITS.width) * 100}% - 2px)`,
                height: `calc(${(1 / BOARD_UNITS.height) * 100}% - 2px)`,
                ['--tone' as string]: tone(cap.index),
                ['--delay' as string]: `${(-(cap.x * 0.11 + cap.y * 0.19) % 2.6).toFixed(2)}s`,
              }}
            />
          ))}
        </div>
        {sidebar('right')}
      </div>
      <p className="stage-caption">
        {idle
          ? 'No keyboard connected. The preview shows an unlit board.'
          : `${effect.name}. ${ZONE_CAPTION[target]} The physical keyboard is the source of truth; this preview only approximates the effect.`}
      </p>
    </div>
  )
}
