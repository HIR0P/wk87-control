import { clamp } from './colors'
import type { Lighting } from './types'

export interface Preset {
  id: string
  name: string
  createdAt: number
  lighting: Lighting
}

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
      return [
        {
          id: source.id,
          name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : 'Preset',
          createdAt: typeof source.createdAt === 'number' ? source.createdAt : Date.now(),
          lighting,
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

export function makePreset(name: string, lighting: Lighting): Preset {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: Date.now(),
    lighting: { ...lighting },
  }
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
      return [makePreset(typeof source.name === 'string' ? source.name : 'Imported', lighting)]
    })
    return presets.length ? presets : null
  } catch {
    return null
  }
}

export function downloadPresets(presets: Preset[]): void {
  const payload = JSON.stringify({ app: 'wk87-control', version: 1, presets }, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'wk87-presets.json'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
