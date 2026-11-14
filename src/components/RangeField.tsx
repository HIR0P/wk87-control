import type { CSSProperties } from 'react'

interface RangeFieldProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  display: string
  hint?: string
  disabled?: boolean
  /** CSS background for the track. Defaults to the filled accent track. */
  track?: string
  onChange: (value: number) => void
}

export function RangeField({
  label,
  value,
  min = 0,
  max = 255,
  step = 1,
  display,
  hint,
  disabled = false,
  track,
  onChange,
}: RangeFieldProps) {
  const ratio = max === min ? 0 : (value - min) / (max - min)
  const percent = Math.round(ratio * 100)
  const background = track ?? `linear-gradient(90deg, var(--accent) ${percent}%, var(--line) ${percent}%)`

  return (
    <label className={`range${disabled ? ' is-disabled' : ''}`}>
      <span className="range-head">
        <span className="range-label">{label}</span>
        <span className="range-value">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ ['--track' as string]: background } as CSSProperties}
      />
      {hint ? <span className="range-hint">{hint}</span> : null}
    </label>
  )
}
