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

/** 0-255 hue byte -> degrees, for display only. */
export function hueDegrees(hue: number): number {
  return Math.round((hue / 255) * 360)
}

export const HUE_GRADIENT =
  'linear-gradient(90deg, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
