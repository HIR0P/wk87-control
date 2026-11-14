export type EffectFamily = 'off' | 'static' | 'wave' | 'breathe' | 'rain' | 'reactive'

export interface EffectDef {
  id: number
  name: string
  family: EffectFamily
  /** Speed slider is meaningful (firmware hides it for effect 0) */
  usesSpeed: boolean
  /** Color picker is meaningful (firmware hides it for these effects) */
  usesColor: boolean
}

/**
 * Effect ids and names come from the community WK87 VIA definition
 * (trananhmanh89/weikav-wk87-via-json). Order matters: the id is what the
 * firmware expects.
 */
const RAW: Array<[number, string, EffectFamily]> = [
  [0, 'All Off', 'off'],
  [1, 'Solid Color', 'static'],
  [2, 'Alphas Mods', 'static'],
  [3, 'Gradient Up Down', 'wave'],
  [4, 'Gradient Left Right', 'wave'],
  [5, 'Breathing', 'breathe'],
  [6, 'Band Sat', 'wave'],
  [7, 'Band Val', 'wave'],
  [8, 'Band Pinwheel Sat', 'wave'],
  [9, 'Band Pinwheel Val', 'wave'],
  [10, 'Band Spiral Sat', 'wave'],
  [11, 'Band Spiral Val', 'wave'],
  [12, 'Cycle All', 'wave'],
  [13, 'Cycle Left Right', 'wave'],
  [14, 'Cycle Up Down', 'wave'],
  [15, 'Rainbow Moving Chevron', 'wave'],
  [16, 'Cycle Out In', 'wave'],
  [17, 'Cycle Out In Dual', 'wave'],
  [18, 'Cycle Pinwheel', 'wave'],
  [19, 'Cycle Spiral', 'wave'],
  [20, 'Dual Beacon', 'wave'],
  [21, 'Rainbow Beacon', 'wave'],
  [22, 'Rainbow Pinwheels', 'wave'],
  [23, 'Raindrops', 'rain'],
  [24, 'Jellybean Raindrops', 'rain'],
  [25, 'Hue Breathing', 'breathe'],
  [26, 'Hue Pendulum', 'wave'],
  [27, 'Hue Wave', 'wave'],
  [28, 'Pixel Rain', 'rain'],
  [29, 'Pixel Flow', 'wave'],
  [30, 'Pixel Fractal', 'wave'],
  [31, 'Typing Heatmap', 'static'],
  [32, 'Digital Rain', 'rain'],
  [33, 'Solid Reactive Simple', 'reactive'],
  [34, 'Solid Reactive', 'reactive'],
  [35, 'Solid Reactive Wide', 'reactive'],
  [36, 'Solid Reactive Multiwide', 'reactive'],
  [37, 'Solid Reactive Cross', 'reactive'],
  [38, 'Solid Reactive Multicross', 'reactive'],
  [39, 'Solid Reactive Nexus', 'reactive'],
  [40, 'Solid Reactive Multinexus', 'reactive'],
  [41, 'Splash', 'reactive'],
  [42, 'Multisplash', 'reactive'],
  [43, 'Solid Splash', 'reactive'],
  [44, 'Solid Multisplash', 'reactive'],
  [45, 'Close All', 'off'],
]

/** Effects that ignore the color setting, per the VIA definition's showIf rules. */
const IGNORES_COLOR = new Set([0, 24, 28, 29, 32])

export const EFFECTS: ReadonlyArray<EffectDef> = RAW.map(([id, name, family]) => ({
  id,
  name,
  family,
  usesSpeed: id !== 0,
  usesColor: !IGNORES_COLOR.has(id),
}))

export function effectById(id: number): EffectDef {
  return EFFECTS.find((e) => e.id === id) ?? EFFECTS[0]
}
