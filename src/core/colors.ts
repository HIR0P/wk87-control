/** HSV helpers. The firmware stores hue, saturation and value as 0-255 bytes. */

export function hsvToRgb(hue: number, saturation: number, value: number): [number, number, number] {
  const h = (clamp(hue, 0, 255) / 255) * 6
  const s = clamp(saturation, 0, 255) / 255
  const v = clamp(value, 0, 255) / 255
  const sextant = Math.floor(h) % 6
  const f = h - Math.floor(h)
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  const table: Array<[number, number, number]> = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ]
  const [r, g, b] = table[sextant]
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

export function hsvToCss(hue: number, saturation: number, value: number): string {
  const [r, g, b] = hsvToRgb(hue, saturation, value)
  return `rgb(${r} ${g} ${b})`
}

export function hsvToHex(hue: number, saturation: number, value: number): string {
  const [r, g, b] = hsvToRgb(hue, saturation, value)
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

/** Converts 0-255 RGB channels into 0-255 HSV bytes matching the firmware format. */
export function rgbToHsv(red: number, green: number, blue: number): [number, number, number] {
  const r = clamp(red, 0, 255) / 255
  const g = clamp(green, 0, 255) / 255
  const b = clamp(blue, 0, 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0
  if (delta > 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6
    } else if (max === g) {
      h = (b - r) / delta + 2
    } else {
      h = (r - g) / delta + 4
    }
    if (h < 0) h += 6
  }

  const s = max === 0 ? 0 : delta / max
  return [Math.round((h / 6) * 255) % 256, Math.round(s * 255), Math.round(max * 255)]
}

/** Parses #RGB or #RRGGBB into firmware HSV bytes, returning null on invalid input. */
export function hexToHsv(input: string): [number, number, number] | null {
  const cleaned = input.trim().replace(/^#/, '')
  let normalized = cleaned
  if (/^[0-9a-f]{3}$/i.test(cleaned)) {
    normalized = cleaned
      .split('')
      .map((ch) => ch + ch)
      .join('')
  }
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return rgbToHsv(r, g, b)
}

export interface ColorSwatch {
  name: string
  hue: number
  saturation: number
  value: number
}

export const COLOR_SWATCHES: ReadonlyArray<ColorSwatch> = [
  { name: 'Warm White', hue: 24, saturation: 64, value: 255 },
  { name: 'Pure White', hue: 0, saturation: 0, value: 255 },
  { name: 'Terracotta', hue: 12, saturation: 215, value: 245 },
  { name: 'Amber', hue: 26, saturation: 245, value: 255 },
  { name: 'Mint', hue: 108, saturation: 195, value: 245 },
  { name: 'Ice Cyan', hue: 132, saturation: 180, value: 255 },
  { name: 'Cobalt', hue: 158, saturation: 235, value: 255 },
  { name: 'Violet', hue: 192, saturation: 210, value: 255 },
  { name: 'Rose', hue: 236, saturation: 215, value: 255 },
  { name: 'Crimson', hue: 0, saturation: 255, value: 255 },
]

/** 0-255 hue byte -> degrees, for display only. */
export function hueDegrees(hue: number): number {
  return Math.round((hue / 255) * 360)
}

export const HUE_GRADIENT =
  'linear-gradient(90deg, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
