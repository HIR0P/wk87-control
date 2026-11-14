import { useCallback, useState } from 'react'
import {
  loadPresets,
  makePreset,
  parsePresets,
  savePresets,
  type Preset,
} from '../core/presets'
import type { Lighting } from '../core/types'

export interface PresetStore {
  presets: Preset[]
  add: (name: string, lighting: Lighting) => boolean
  remove: (id: string) => boolean
  clear: () => boolean
  importFromText: (text: string) => number | null
}

export function usePresets(): PresetStore {
  const [presets, setPresets] = useState<Preset[]>(() => loadPresets())

  const persist = useCallback((next: Preset[]) => {
    setPresets(next)
    return savePresets(next)
  }, [])

  const add = useCallback(
    (name: string, lighting: Lighting) => persist([makePreset(name, lighting), ...presets].slice(0, 40)),
    [persist, presets],
  )

  const remove = useCallback(
    (id: string) => persist(presets.filter((preset) => preset.id !== id)),
    [persist, presets],
  )

  const clear = useCallback(() => persist([]), [persist])

  const importFromText = useCallback(
    (text: string) => {
      const imported = parsePresets(text)
      if (!imported) return null
      const existing = new Set(presets.map((preset) => `${preset.name}:${JSON.stringify(preset.lighting)}`))
      const fresh = imported.filter(
        (preset) => !existing.has(`${preset.name}:${JSON.stringify(preset.lighting)}`),
      )
      persist([...fresh, ...presets].slice(0, 40))
      return fresh.length
    },
    [persist, presets],
  )

  return { presets, add, remove, clear, importFromText }
}
