import { useCallback, useState } from 'react'
import {
  loadPresets,
  makePreset,
  parsePresets,
  presetFingerprint,
  savePresets,
  type Preset,
} from '../core/presets'
import type { Lighting } from '../core/types'

export interface PresetStore {
  presets: Preset[]
  add: (name: string, lighting: Lighting, sideLighting?: Lighting) => boolean
  rename: (id: string, name: string) => boolean
  overwrite: (id: string, lighting: Lighting, sideLighting?: Lighting) => boolean
  remove: (id: string) => boolean
  clear: () => boolean
  importFromText: (text: string) => number | null
}

const MAX_PRESETS = 40

export function usePresets(): PresetStore {
  const [presets, setPresets] = useState<Preset[]>(() => loadPresets())

  const persist = useCallback((next: Preset[]) => {
    setPresets(next)
    return savePresets(next)
  }, [])

  const add = useCallback(
    (name: string, lighting: Lighting, sideLighting?: Lighting) =>
      persist([makePreset(name, lighting, sideLighting), ...presets].slice(0, MAX_PRESETS)),
    [persist, presets],
  )

  const rename = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return false
      return persist(presets.map((preset) => (preset.id === id ? { ...preset, name: trimmed } : preset)))
    },
    [persist, presets],
  )

  const overwrite = useCallback(
    (id: string, lighting: Lighting, sideLighting?: Lighting) =>
      persist(
        presets.map((preset) =>
          preset.id === id
            ? {
                ...preset,
                scope: sideLighting ? 'board' : 'zone',
                lighting: { ...lighting },
                sideLighting: sideLighting ? { ...sideLighting } : undefined,
              }
            : preset,
        ),
      ),
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
      const existing = new Set(presets.map((preset) => presetFingerprint(preset)))
      const fresh = imported.filter((preset) => !existing.has(presetFingerprint(preset)))
      persist([...fresh, ...presets].slice(0, MAX_PRESETS))
      return fresh.length
    },
    [persist, presets],
  )

  return { presets, add, rename, overwrite, remove, clear, importFromText }
}
