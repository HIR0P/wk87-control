import { clamp, hsvToRgb } from './colors'
import { BOARD_KEYS, BOARD_UNITS, type BoardKey } from './layout'
import type { Lighting } from './types'

export interface ReactiveHit {
  /** Key center X in board units (0..18.5). */
  x: number
  /** Key center Y in board units (0..6.25). */
  y: number
  /** Timestamp in seconds (matching engine time). */
  at: number
  /** Key index for single-key effects and heatmap. */
  keyIndex: number
}

export interface SamplePoint {
  index: number
  /** Center X in board units (0..18.5). */
  x: number
  /** Center Y in board units (0..6.25). */
  y: number
  /** Normalized X (0..1). */
  nx: number
  /** Normalized Y (0..1). */
  ny: number
  /** True for modifiers / non-alpha keys (used by Alphas Mods). */
  isMod: boolean
}

const CENTER_X = BOARD_UNITS.width / 2
const CENTER_Y = BOARD_UNITS.height / 2
const MAX_DIST = Math.hypot(CENTER_X, CENTER_Y)

const ALPHA_CODES = new Set([
  'Backquote',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
  'Digit0',
  'Minus',
  'Equal',
  'KeyQ',
  'KeyW',
  'KeyE',
  'KeyR',
  'KeyT',
  'KeyY',
  'KeyU',
  'KeyI',
  'KeyO',
  'KeyP',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyF',
  'KeyG',
  'KeyH',
  'KeyJ',
  'KeyK',
  'KeyL',
  'Semicolon',
  'Quote',
  'KeyZ',
  'KeyX',
  'KeyC',
  'KeyV',
  'KeyB',
  'KeyN',
  'KeyM',
  'Comma',
  'Period',
  'Slash',
])

export function toSamplePoint(cap: BoardKey): SamplePoint {
  const x = cap.x + cap.w / 2
  const y = cap.y + 0.5
  return {
    index: cap.index,
    x,
    y,
    nx: clamp(x / BOARD_UNITS.width, 0, 1),
    ny: clamp(y / BOARD_UNITS.height, 0, 1),
    isMod: !cap.code || !ALPHA_CODES.has(cap.code),
  }
}

export const KEY_SAMPLE_POINTS: ReadonlyArray<SamplePoint> = BOARD_KEYS.map(toSamplePoint)

export const SIDE_SEGMENTS = 8

export function buildSideSamplePoints(side: 'left' | 'right'): SamplePoint[] {
  const x = side === 'left' ? 0.3 : BOARD_UNITS.width - 0.3
  const nx = side === 'left' ? 0.02 : 0.98
  return Array.from({ length: SIDE_SEGMENTS }, (_, i) => {
    const ny = (i + 0.5) / SIDE_SEGMENTS
    return {
      index: (side === 'left' ? 100 : 200) + i,
      x,
      y: ny * BOARD_UNITS.height,
      nx,
      ny,
      isMod: true,
    }
  })
}

const wrap256 = (value: number): number => ((value % 256) + 256) % 256

/** Deterministic pseudo-random in [0, 1) from integer seed. */
function hash01(seed: number): number {
  let x = (seed | 0) * 374761393 + 668265263
  x = (x ^ (x >> 13)) * 1274126177
  return ((x ^ (x >> 16)) >>> 0) / 4294967296
}

/** Speed multiplier in cycles/sec scaled smoothly from firmware 0..255 byte. */
export function speedFactor(speed: number): number {
  return 0.22 + (clamp(speed, 0, 255) / 255) * 2.1
}

function reactivePulse(
  point: SamplePoint,
  timeSec: number,
  hits: ReadonlyArray<ReactiveHit>,
  effect: number,
  spd: number,
): { intensity: number; hueShift: number } {
  const decay = 1.6 / Math.max(0.45, spd * 0.85)
  const waveSpeed = 7.5 * Math.max(0.5, spd * 0.75)
  const multi = effect === 36 || effect === 38 || effect === 40 || effect === 42 || effect === 44
  const source = multi ? hits : hits.slice(0, 1)

  let maxIntensity = 0
  let hueShift = 0

  for (const hit of source) {
    const age = timeSec - hit.at
    if (age < 0 || age > decay * 1.4) continue
    const life = clamp(1 - age / decay, 0, 1)
    const dx = Math.abs(point.x - hit.x)
    const dy = Math.abs(point.y - hit.y)
    const dist = Math.hypot(dx, dy)

    let local = 0
    if (effect === 33 || effect === 34) {
      // Single key reactive
      local = point.index === hit.keyIndex || dist < 0.75 ? life : 0
    } else if (effect === 35 || effect === 36) {
      // Wide radial glow
      const radius = 3.2
      local = dist < radius ? life * (1 - dist / radius) : 0
    } else if (effect === 37 || effect === 38) {
      // Cross (same row or same column)
      const onRow = dy < 0.6
      const onCol = dx < 0.7
      if (onRow || onCol) {
        const axisDist = onRow ? dx : dy
        local = life * clamp(1 - axisDist / 12, 0.15, 1)
      }
    } else if (effect === 39 || effect === 40) {
      // Nexus: pulses travelling outward along + axes
      const travel = age * waveSpeed
      const onRow = dy < 0.6 && Math.abs(dx - travel) < 1.35
      const onCol = dx < 0.7 && Math.abs(dy - travel) < 1.35
      if (onRow) local = life * (1 - Math.abs(dx - travel) / 1.35)
      else if (onCol) local = life * (1 - Math.abs(dy - travel) / 1.35)
    } else if (effect >= 41 && effect <= 44) {
      // Expanding splash ring
      const radius = age * waveSpeed
      const ringDelta = Math.abs(dist - radius)
      if (ringDelta < 1.75) {
        local = life * (1 - ringDelta / 1.75)
        if (effect === 41 || effect === 42) {
          hueShift = Math.max(hueShift, (dist * 24 + age * 140) % 256)
        }
      }
    }

    if (local > maxIntensity) {
      maxIntensity = local
    }
  }

  return { intensity: clamp(maxIntensity, 0, 1), hueShift }
}

/**
 * Evaluates a single LED sample point for any of the 46 WK87 firmware effects (0..45).
 * Returns an [r, g, b] tuple (0..255).
 */
export function evaluateEffectRgb(
  lighting: Lighting,
  point: SamplePoint,
  timeSec: number,
  hits: ReadonlyArray<ReactiveHit> = [],
): [number, number, number] {
  const effect = Math.round(clamp(lighting.effect, 0, 45))
  const brightnessScale = clamp(lighting.brightness, 0, 255) / 255
  if (effect === 0 || effect === 45 || brightnessScale <= 0) {
    return [0, 0, 0]
  }

  const baseH = clamp(lighting.hue, 0, 255)
  const baseS = clamp(lighting.saturation, 0, 255)
  const baseV = clamp(lighting.value, 0, 255)
  // Keep preview visibly lit when brightness > 0 even at modest levels
  const vScale = (0.2 + 0.8 * brightnessScale) * (baseV / 255)
  const spd = speedFactor(lighting.speed)
  const phase = timeSec * spd

  const dx = point.x - CENTER_X
  const dy = point.y - CENTER_Y
  const dist = Math.hypot(dx, dy)
  const angle = Math.atan2(dy, dx) // -PI..PI
  const angleByte = ((angle + Math.PI) / (2 * Math.PI)) * 256

  let h = baseH
  let s = baseS
  let v = 255 * vScale

  switch (effect) {
    case 1: // Solid Color
      break

    case 2: // Alphas Mods
      if (point.isMod) h = wrap256(baseH + 42)
      break

    case 3: // Gradient Up Down
      h = wrap256(baseH + point.ny * 92)
      break

    case 4: // Gradient Left Right
      h = wrap256(baseH + point.nx * 92)
      break

    case 5: {
      // Breathing
      const breath = 0.5 - 0.5 * Math.cos(phase * Math.PI)
      v = (26 + 229 * breath) * vScale
      break
    }

    case 6: {
      // Band Sat
      const bandPos = ((phase * 0.45) % 1.4) - 0.2
      const band = clamp(1 - Math.abs(point.nx - bandPos) * 4.2, 0, 1)
      s = baseS * (1 - band * 0.9)
      break
    }

    case 7: {
      // Band Val
      const bandPos = ((phase * 0.45) % 1.4) - 0.2
      const band = clamp(1 - Math.abs(point.nx - bandPos) * 4.2, 0, 1)
      v = (32 + 223 * band) * vScale
      break
    }

    case 8: {
      // Band Pinwheel Sat
      const wave = 0.5 + 0.5 * Math.sin(angle * 2 - phase * 2.6)
      s = baseS * (0.15 + 0.85 * wave)
      break
    }

    case 9: {
      // Band Pinwheel Val
      const wave = 0.5 + 0.5 * Math.sin(angle * 2 - phase * 2.6)
      v = (24 + 231 * wave) * vScale
      break
    }

    case 10: {
      // Band Spiral Sat
      const wave = 0.5 + 0.5 * Math.sin(angle * 2 + dist * 0.9 - phase * 2.8)
      s = baseS * (0.15 + 0.85 * wave)
      break
    }

    case 11: {
      // Band Spiral Val
      const wave = 0.5 + 0.5 * Math.sin(angle * 2 + dist * 0.9 - phase * 2.8)
      v = (24 + 231 * wave) * vScale
      break
    }

    case 12: // Cycle All
      h = wrap256(baseH + phase * 38)
      break

    case 13: // Cycle Left Right
      h = wrap256(baseH + point.nx * 256 - phase * 72)
      break

    case 14: // Cycle Up Down
      h = wrap256(baseH + point.ny * 256 - phase * 72)
      break

    case 15: {
      // Rainbow Moving Chevron
      const chevron = point.nx - Math.abs(point.ny - 0.5) * 0.85
      h = wrap256(baseH + chevron * 220 - phase * 78)
      break
    }

    case 16: // Cycle Out In
      h = wrap256(baseH + (dist / MAX_DIST) * 256 + phase * 78)
      break

    case 17: {
      // Cycle Out In Dual
      const d1 = Math.hypot(point.x - BOARD_UNITS.width * 0.28, dy)
      const d2 = Math.hypot(point.x - BOARD_UNITS.width * 0.72, dy)
      const minD = Math.min(d1, d2)
      h = wrap256(baseH + (minD / (MAX_DIST * 0.75)) * 256 + phase * 78)
      break
    }

    case 18: // Cycle Pinwheel
      h = wrap256(baseH + angleByte - phase * 68)
      break

    case 19: // Cycle Spiral
      h = wrap256(baseH + angleByte + dist * 22 - phase * 72)
      break

    case 20: {
      // Dual Beacon
      const beam = Math.pow(0.5 + 0.5 * Math.cos(angle * 2 - phase * 2.4), 2)
      h = wrap256(baseH + beam * 64)
      v = (60 + 195 * beam) * vScale
      break
    }

    case 21: {
      // Rainbow Beacon
      const beam = 0.5 + 0.5 * Math.cos(angle - phase * 2.4)
      h = wrap256(baseH + angleByte - phase * 42)
      v = (55 + 200 * beam) * vScale
      break
    }

    case 22: {
      // Rainbow Pinwheels
      const a1 = Math.atan2(dy, point.x - BOARD_UNITS.width * 0.3)
      const a2 = Math.atan2(dy, point.x - BOARD_UNITS.width * 0.7)
      const chosen = point.nx < 0.5 ? a1 : -a2
      h = wrap256(baseH + ((chosen + Math.PI) / (2 * Math.PI)) * 256 - phase * 74)
      break
    }

    case 23:
    case 24: {
      // Raindrops (23: base hue family, 24: Jellybean full rainbow)
      const bucket = Math.floor(phase * 1.45 + hash01(point.index * 17 + 3) * 4)
      const seed = point.index * 97 + bucket * 31
      const frac = (phase * 1.45 + hash01(point.index * 17 + 3) * 4) % 1
      const twinkle = Math.sin(frac * Math.PI)
      const active = hash01(seed) > 0.42
      if (effect === 24) {
        h = hash01(seed + 7) * 256
        s = 190 + hash01(seed + 13) * 65
      } else {
        h = wrap256(baseH + (hash01(seed + 7) - 0.5) * 46)
      }
      v = (active ? 40 + 215 * twinkle : 22) * vScale
      break
    }

    case 25: {
      // Hue Breathing
      const shift = Math.sin(phase * Math.PI) * 26
      h = wrap256(baseH + shift)
      break
    }

    case 26: {
      // Hue Pendulum
      const swing = Math.sin(phase * Math.PI) * 0.5 + 0.5
      const delta = (point.nx - swing) * 48
      h = wrap256(baseH + delta)
      break
    }

    case 27: {
      // Hue Wave
      const wave = Math.sin(point.nx * Math.PI * 2 - phase * 2.4) * 32
      h = wrap256(baseH + wave)
      break
    }

    case 28: {
      // Pixel Rain (multi-color falling drops)
      const col = Math.floor(point.x)
      const colPhase = phase * 3.4 + hash01(col * 19 + 5) * 10
      const dropY = colPhase % 8.5
      const trail = dropY - point.y
      const hit = trail >= 0 && trail < 2.2
      const dropId = Math.floor(colPhase / 8.5)
      h = hash01(col * 53 + dropId * 17) * 256
      s = 235
      v = (hit ? (1 - trail / 2.2) * 255 : 18) * vScale
      break
    }

    case 29: {
      // Pixel Flow (scrolling vibrant cells)
      const step = Math.floor(phase * 3.2)
      const cellX = Math.floor(point.x) + step
      const cellY = Math.floor(point.y)
      const seed = cellX * 37 + cellY * 131
      h = hash01(seed) * 256
      s = 220
      v = (hash01(seed + 11) > 0.28 ? 225 : 42) * vScale
      break
    }

    case 30: {
      // Pixel Fractal (mirrored geometric pulse)
      const step = Math.floor(phase * 2.6)
      const symX = Math.floor(Math.abs(point.x - CENTER_X))
      const symY = Math.floor(point.y)
      const lit = ((symX ^ symY ^ step) & 3) === 0 || hash01(symX * 41 + symY * 13 + step * 7) > 0.62
      v = (lit ? 240 : 28) * vScale
      h = wrap256(baseH + symX * 6)
      break
    }

    case 31: {
      // Typing Heatmap (blue -> cyan -> green -> yellow -> red on activity)
      let heat = 0
      for (const hit of hits) {
        const age = timeSec - hit.at
        if (age < 0 || age > 4.5) continue
        const d = Math.hypot(point.x - hit.x, point.y - hit.y)
        if (d < 2.6) {
          heat += (1 - age / 4.5) * (1 - d / 2.6) * 0.95
        }
      }
      heat = clamp(heat, 0, 1)
      if (heat <= 0.02) {
        h = 165 // cool deep blue idle
        s = 220
        v = 55 * vScale
      } else {
        h = wrap256(165 - heat * 165) // blue -> green -> yellow -> red
        s = 245
        v = (70 + 185 * heat) * vScale
      }
      break
    }

    case 32: {
      // Digital Rain (Matrix green columns)
      const col = Math.floor(point.x)
      const colSpeed = 2.6 + hash01(col * 23 + 1) * 1.8
      const dropPos = (phase * colSpeed + hash01(col * 71 + 9) * 12) % 9.5
      const trail = dropPos - point.y
      h = 85 // pure green
      if (trail >= 0 && trail < 0.75) {
        // Bright white-green head
        s = 70
        v = 255 * vScale
      } else if (trail >= 0.75 && trail < 3.6) {
        s = 245
        v = ((1 - (trail - 0.75) / 2.85) * 225) * vScale
      } else {
        s = 245
        v = 14 * vScale
      }
      break
    }

    default: {
      // Reactive effects 33..44
      const { intensity, hueShift } = reactivePulse(point, timeSec, hits, effect, spd)
      if (effect === 34) {
        // Solid Reactive: stays lit in base color, shifts hue on press
        h = wrap256(baseH + intensity * 110)
        v = (155 + 100 * intensity) * vScale
      } else if (effect === 41 || effect === 42) {
        // Rainbow Splash / Multisplash
        h = wrap256(baseH + hueShift)
        s = 240
        v = (22 + 233 * intensity) * vScale
      } else {
        // Solid Reactive Simple / Wide / Cross / Nexus / Solid Splash
        v = (22 + 233 * intensity) * vScale
      }
      break
    }
  }

  return hsvToRgb(h, s, clamp(v, 0, 255))
}
