import { clamp } from './colors'
import type { Lighting } from './types'

export type PresetScope = 'zone' | 'board'

export interface Preset {
  id: string
  name: string
  createdAt: number
  scope: PresetScope
  /** Single-zone lighting, or key backlight (ch. 3) when scope === 'board'. */
  lighting: Lighting
  /** Side panel strip (ch. 2) when scope === 'board'. */
  sideLighting?: Lighting
}

export interface StarterPreset {
  id: string
  name: string
  caption: string
  lighting: Lighting
  sideLighting: Lighting
}

export const STARTER_PRESETS: ReadonlyArray<StarterPreset> = [
  {
    id: 'starter-warm-desk',
    name: 'Warm Desk',
    caption: 'Soft warm white keys with gentle terracotta side glow',
    lighting: { brightness: 185, effect: 1, speed: 64, hue: 24, saturation: 72, value: 255 },
    sideLighting: { brightness: 160, effect: 5, speed: 48, hue: 12, saturation: 210, value: 240 },
  },
  {
    id: 'starter-terracotta-pulse',
    name: 'Terracotta Pulse',
    caption: 'Reactive warm keys paired with calm breathing side strip',
    lighting: { brightness: 215, effect: 34, speed: 120, hue: 12, saturation: 215, value: 255 },
    sideLighting: { brightness: 190, effect: 5, speed: 70, hue: 18, saturation: 230, value: 255 },
  },
  {
    id: 'starter-arctic-cyan',
    name: 'Arctic Cyan',
    caption: 'Cool ice-blue keys with slow hue wave along the edges',
    lighting: { brightness: 195, effect: 1, speed: 80, hue: 132, saturation: 175, value: 255 },
    sideLighting: { brightness: 205, effect: 27, speed: 60, hue: 145, saturation: 215, value: 255 },
  },
  {
    id: 'starter-stealth-dim',
    name: 'Night Dim',
    caption: 'Low-glare amber keys, side panel switched off',
    lighting: { brightness: 70, effect: 1, speed: 40, hue: 22, saturation: 225, value: 255 },
    sideLighting: { brightness: 0, effect: 0, speed: 0, hue: 0, saturation: 0, value: 0 },
  },
  {
    id: 'starter-spectrum-flow',
    name: 'Spectrum Flow',
    caption: 'Synchronised left-to-right color cycle across the whole board',
    lighting: { brightness: 210, effect: 13, speed: 85, hue: 0, saturation: 255, value: 255 },
    sideLighting: { brightness: 220, effect: 14, speed: 85, hue: 85, saturation: 255, value: 255 },
  },
]

const STORAGE_KEY = 'wk87.presets.v1'

function sanitiseLighting(input: unknown): Lighting | null {
  if (!input || typeof input !== 'object') return null
  const source = input as Record<string, unknown>
  const numbers: Array<keyof Lighting> = ['brightness', 'effect', 'speed', 'hue', 'saturation', 'value']
  const lighting = {} as Lighting
  for (const field of numbers) {
    const raw = source[field]
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
    lighting[field] = Math.round(field === 'effect' ? clamp(raw, 0, 45) : clamp(raw, 0, 255))
  }
  return lighting
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry): Preset[] => {
      if (!entry || typeof entry !== 'object') return []
      const source = entry as Record<string, unknown>
      const lighting = sanitiseLighting(source.lighting)
      if (!lighting || typeof source.id !== 'string') return []
      const sideLighting = sanitiseLighting(source.sideLighting) ?? undefined
      const scope: PresetScope = sideLighting ? 'board' : 'zone'
      return [
        {
          id: source.id,
          name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : 'Preset',
          createdAt: typeof source.createdAt === 'number' ? source.createdAt : Date.now(),
          scope,
          lighting,
          ...(sideLighting ? { sideLighting } : {}),
        },
      ]
    })
  } catch {
    return []
  }
}

export function savePresets(presets: Preset[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
    return true
  } catch {
    return false
  }
}

export function makePreset(name: string, lighting: Lighting, sideLighting?: Lighting): Preset {
  return {
    id: makeId(),
    name: name.trim() || 'Preset',
    createdAt: Date.now(),
    scope: sideLighting ? 'board' : 'zone',
    lighting: { ...lighting },
    ...(sideLighting ? { sideLighting: { ...sideLighting } } : {}),
  }
}

export function presetFingerprint(preset: Pick<Preset, 'name' | 'scope' | 'lighting' | 'sideLighting'>): string {
  return `${preset.name}:${preset.scope}:${JSON.stringify(preset.lighting)}:${JSON.stringify(preset.sideLighting ?? null)}`
}

export function parsePresets(text: string): Preset[] | null {
  try {
    const parsed: unknown = JSON.parse(text)
    const list = Array.isArray(parsed) ? parsed : (parsed as { presets?: unknown })?.presets
    if (!Array.isArray(list)) return null
    const presets = list.flatMap((entry): Preset[] => {
      if (!entry || typeof entry !== 'object') return []
      const source = entry as Record<string, unknown>
      const lighting = sanitiseLighting(source.lighting)
      if (!lighting) return []
      const sideLighting = sanitiseLighting(source.sideLighting) ?? undefined
      return [makePreset(typeof source.name === 'string' ? source.name : 'Imported', lighting, sideLighting)]
    })
    return presets.length ? presets : null
  } catch {
    return null
  }
}

export function downloadPresets(presets: Preset[]): void {
  const payload = JSON.stringify({ app: 'wk87-control', version: 2, presets }, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'wk87-presets.json'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
