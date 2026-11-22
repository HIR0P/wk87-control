import { useEffect, useMemo, useRef, useState } from 'react'
import { KeyboardStage } from '../components/KeyboardStage'
import { RangeField } from '../components/RangeField'
import { COLOR_SWATCHES, HUE_GRADIENT, hexToHsv, hsvToCss, hsvToHex, hueDegrees } from '../core/colors'
import { EFFECTS, effectById, type EffectFamily } from '../core/effects'
import { STARTER_PRESETS, downloadPresets, type Preset, type PresetScope } from '../core/presets'
import type { DeviceDescriptor, Lighting, ZoneLighting } from '../core/types'
import { LIGHTING_CHANNELS, type LightingTarget } from '../core/protocol'
import type { LightingController, LightingStatus } from '../hooks/useLighting'
import type { PresetStore } from '../hooks/usePresets'

interface LightingPageProps {
  descriptor: DeviceDescriptor | null
  controller: LightingController
  connected: boolean
  connecting: boolean
  onConnect: () => void
  onDemo: () => void
  presets: PresetStore
  lightTarget: LightingTarget
  onLightTarget: (target: LightingTarget) => void
}

const ZONES: Array<{ id: LightingTarget; label: string; hint: string }> = [
  {
    id: 'keys',
    label: 'Key backlight',
    hint: `Firmware channel ${LIGHTING_CHANNELS.keys} — the LEDs under the keycaps.`,
  },
  {
    id: 'side',
    label: 'Side panel',
    hint: `Firmware channel ${LIGHTING_CHANNELS.side} — the strip around the case, separate from the keys.`,
  },
  {
    id: 'both',
    label: 'Both',
    hint: 'The same effect, brightness and colour are written to each channel separately.',
  },
]

const EFFECT_FAMILIES: Array<{ id: 'all' | EffectFamily; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'static', label: 'Static' },
  { id: 'wave', label: 'Wave' },
  { id: 'breathe', label: 'Breathe' },
  { id: 'rain', label: 'Rain' },
  { id: 'reactive', label: 'Reactive' },
  { id: 'off', label: 'Off' },
]

const STATUS_TEXT: Record<LightingStatus, string> = {
  idle: 'Not connected',
  reading: 'Reading…',
  applying: 'Sending…',
  ready: 'Synced',
  error: 'Not synced',
}

export function LightingPage({
  descriptor,
  controller,
  connected,
  connecting,
  onConnect,
  onDemo,
  presets,
  lightTarget,
  onLightTarget,
}: LightingPageProps) {
  const {
    lighting,
    zones,
    echoZones,
    status,
    error,
    lastLatencyMs,
    canUndo,
    isOff,
    update,
    applyZones,
    mirrorZone,
    togglePower,
    undo,
    refresh,
  } = controller

  const [showLegends, setShowLegends] = useState(true)
  const [familyFilter, setFamilyFilter] = useState<'all' | EffectFamily>('all')
  const [effectQuery, setEffectQuery] = useState('')
  const [hexDraft, setHexDraft] = useState<string | null>(null)

  const effect = effectById(lighting.effect)
  const demo = descriptor?.transport === 'demo'
  const zone = ZONES.find((item) => item.id === lightTarget) ?? ZONES[0]
  const currentHex = hsvToHex(lighting.hue, lighting.saturation, lighting.value)

  useEffect(() => {
    setHexDraft(null)
  }, [currentHex])

  useEffect(() => {
    if (!connected) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        const tag = (event.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        if (canUndo) {
          event.preventDefault()
          undo()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canUndo, connected, undo])

  const filteredEffects = useMemo(() => {
    const query = effectQuery.trim().toLowerCase()
    return EFFECTS.filter((item) => {
      if (familyFilter !== 'all' && item.family !== familyFilter) return false
      if (!query) return true
      return item.name.toLowerCase().includes(query) || String(item.id) === query
    })
  }, [effectQuery, familyFilter])

  const stepEffect = (delta: number) => {
    const nextId = (lighting.effect + delta + EFFECTS.length) % EFFECTS.length
    update({ effect: nextId })
  }

  const applyHex = (raw: string) => {
    const hsv = hexToHsv(raw)
    if (!hsv) return false
    const [hue, saturation, value] = hsv
    update({ hue, saturation, value })
    return true
  }

  const applyPreset = (preset: Preset) => {
    if (preset.scope === 'board' && preset.sideLighting) {
      applyZones({ keys: preset.lighting, side: preset.sideLighting })
    } else {
      update(preset.lighting)
    }
  }

  return (
    <div className="page">
      <section className="card stage-card">
        <div className="card-head">
          <div>
            <span className="eyebrow">Preview</span>
            <h2>{connected ? effect.name : 'Lighting'}</h2>
          </div>
          <div className="head-controls">
            <button
              type="button"
              className={`chip-btn${showLegends ? ' is-active' : ''}`}
              aria-pressed={showLegends}
              onClick={() => setShowLegends((value) => !value)}
            >
              Legends
            </button>
            {connected ? (
              <>
                <button
                  type="button"
                  className={`chip-btn${isOff ? ' is-active' : ''}`}
                  aria-pressed={isOff}
                  onClick={togglePower}
                >
                  {isOff ? 'Restore lights' : 'Lights off'}
                </button>
                <button
                  type="button"
                  className="chip-btn"
                  disabled={!canUndo}
                  onClick={undo}
                  title="Undo last lighting change (Ctrl+Z)"
                >
                  Undo
                </button>
              </>
            ) : null}
            <span className={`status status-${connected ? status : 'idle'}`}>
              {connected ? STATUS_TEXT[status] : 'Not connected'}
            </span>
          </div>
        </div>

        <KeyboardStage
          zones={zones}
          idle={!connected}
          target={lightTarget}
          showLegends={showLegends}
        />

        {error ? (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        ) : null}

        {connected && descriptor ? (
          <div className="readback">
            <span>
              {demo ? 'Demo device' : descriptor.productName} ·{' '}
              {descriptor.transport === 'demo'
                ? 'simulated'
                : descriptor.transport === '2.4g'
                  ? '2.4G receiver'
                  : 'wired USB'}
              {lastLatencyMs !== null ? ` · ${lastLatencyMs} ms` : ''}
            </span>
            {echoZones.keys ? (
              <span>
                Keys (ch. {LIGHTING_CHANNELS.keys}): {effectById(echoZones.keys.effect).name} ·{' '}
                {echoZones.keys.brightness}/255
              </span>
            ) : null}
            {echoZones.side ? (
              <span>
                Side (ch. {LIGHTING_CHANNELS.side}): {effectById(echoZones.side.effect).name} ·{' '}
                {echoZones.side.brightness}/255
              </span>
            ) : null}
            <button type="button" className="link" onClick={refresh}>
              Read again
            </button>
          </div>
        ) : null}
      </section>

      <div className="page-columns">
        {connected ? (
          <section className="card">
            <div className="card-head">
              <h3>Lighting controls</h3>
              <span className="muted small">Changes apply as you move a slider</span>
            </div>

            <div className="field">
              <div className="field-row">
                <span className="field-label">Lighting zone</span>
                {lightTarget === 'keys' ? (
                  <button
                    type="button"
                    className="link"
                    onClick={() => mirrorZone('keys', 'side')}
                  >
                    Copy keys → side
                  </button>
                ) : lightTarget === 'side' ? (
                  <button
                    type="button"
                    className="link"
                    onClick={() => mirrorZone('side', 'keys')}
                  >
                    Copy side → keys
                  </button>
                ) : null}
              </div>
              <div className="segmented" role="group" aria-label="Lighting zone">
                {ZONES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`seg${lightTarget === item.id ? ' is-active' : ''}`}
                    aria-pressed={lightTarget === item.id}
                    onClick={() => onLightTarget(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <span className="muted small zone-hint">{zone.hint}</span>
            </div>

            <div className="effect-browser">
              <div className="field-row">
                <span className="field-label">
                  Effect <span className="muted">#{effect.id} · {effect.name}</span>
                </span>
                <div className="stepper">
                  <button
                    type="button"
                    className="chip-btn"
                    aria-label="Previous effect"
                    onClick={() => stepEffect(-1)}
                  >
                    ← Prev
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    aria-label="Next effect"
                    onClick={() => stepEffect(1)}
                  >
                    Next →
                  </button>
                </div>
              </div>

              <div className="filter-pills" role="group" aria-label="Filter effects by family">
                {EFFECT_FAMILIES.map((family) => (
                  <button
                    key={family.id}
                    type="button"
                    className={`pill${familyFilter === family.id ? ' is-active' : ''}`}
                    aria-pressed={familyFilter === family.id}
                    onClick={() => setFamilyFilter(family.id)}
                  >
                    {family.label}
                  </button>
                ))}
              </div>

              <input
                type="search"
                className="text-input effect-search"
                placeholder="Search 46 firmware effects…"
                aria-label="Search effects"
                value={effectQuery}
                onChange={(event) => setEffectQuery(event.target.value)}
              />

              <div className="effect-grid" role="listbox" aria-label="Effects">
                {filteredEffects.length ? (
                  filteredEffects.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={item.id === lighting.effect}
                      className={`effect-item${item.id === lighting.effect ? ' is-active' : ''}`}
                      onClick={() => update({ effect: item.id })}
                    >
                      <span className="effect-id">{String(item.id).padStart(2, '0')}</span>
                      <span className="effect-name">{item.name}</span>
                    </button>
                  ))
                ) : (
                  <p className="muted small effect-empty">No effects match “{effectQuery}”.</p>
                )}
              </div>
            </div>

            <RangeField
              label="Brightness"
              value={lighting.brightness}
              display={`${Math.round((lighting.brightness / 255) * 100)}%`}
              hint="Firmware stores one step below the sent value. That is expected."
              onChange={(brightness) => update({ brightness })}
            />

            <RangeField
              label="Effect speed"
              value={lighting.speed}
              display={`${Math.round((lighting.speed / 255) * 100)}%`}
              disabled={!effect.usesSpeed}
              hint={effect.usesSpeed ? undefined : 'This effect does not animate.'}
              onChange={(speed) => update({ speed })}
            />

            <fieldset className="color-group" disabled={!effect.usesColor}>
              <legend>
                Color
                {effect.usesColor ? null : <span className="muted"> — this effect ignores it</span>}
              </legend>
              <p className="muted small color-note">
                Cycling, rainbow and band effects generate their own colors. Pick <strong>Solid Color</strong>{' '}
                to set a fixed one.
              </p>

              <div className="swatch-row" role="group" aria-label="Quick color swatches">
                {COLOR_SWATCHES.map((swatch) => {
                  const css = hsvToCss(swatch.hue, swatch.saturation, swatch.value)
                  const selected =
                    Math.abs(lighting.hue - swatch.hue) <= 4 &&
                    Math.abs(lighting.saturation - swatch.saturation) <= 12 &&
                    Math.abs(lighting.value - swatch.value) <= 12
                  return (
                    <button
                      key={swatch.name}
                      type="button"
                      className={`swatch-btn${selected ? ' is-active' : ''}`}
                      style={{ background: css }}
                      title={swatch.name}
                      aria-label={swatch.name}
                      disabled={!effect.usesColor}
                      onClick={() =>
                        update({
                          hue: swatch.hue,
                          saturation: swatch.saturation,
                          value: swatch.value,
                        })
                      }
                    />
                  )
                })}
              </div>

              <div className="color-inputs">
                <label className="native-color-wrap" title="Pick a color">
                  <input
                    type="color"
                    className="native-color"
                    value={currentHex}
                    disabled={!effect.usesColor}
                    aria-label="Color picker"
                    onChange={(event) => applyHex(event.target.value)}
                  />
                  <span className="swatch" style={{ background: currentHex }} />
                </label>
                <input
                  type="text"
                  className="text-input hex-input"
                  aria-label="Hex color"
                  value={hexDraft ?? currentHex.toUpperCase()}
                  disabled={!effect.usesColor}
                  maxLength={7}
                  spellCheck={false}
                  onChange={(event) => {
                    const next = event.target.value
                    setHexDraft(next)
                    if (/^#?[0-9a-f]{6}$/i.test(next.trim())) {
                      applyHex(next)
                    }
                  }}
                  onBlur={() => {
                    if (hexDraft !== null && !applyHex(hexDraft)) {
                      setHexDraft(null)
                    }
                  }}
                />
                <code className="hsv-readout muted small">
                  HSV {lighting.hue}, {lighting.saturation}, {lighting.value}
                </code>
              </div>

              <RangeField
                label="Hue"
                value={lighting.hue}
                display={`${hueDegrees(lighting.hue)}°`}
                track={HUE_GRADIENT}
                disabled={!effect.usesColor}
                onChange={(hue) => update({ hue })}
              />

              <RangeField
                label="Saturation"
                value={lighting.saturation}
                display={`${Math.round((lighting.saturation / 255) * 100)}%`}
                disabled={!effect.usesColor}
                track={`linear-gradient(90deg, ${hsvToCss(lighting.hue, 0, Math.max(lighting.value, 40))}, ${hsvToCss(lighting.hue, 255, Math.max(lighting.value, 40))})`}
                onChange={(saturation) => update({ saturation })}
              />

              <RangeField
                label="Color value"
                value={lighting.value}
                display={`${Math.round((lighting.value / 255) * 100)}%`}
                disabled={!effect.usesColor}
                track={`linear-gradient(90deg, #000, ${hsvToCss(lighting.hue, lighting.saturation, 255)})`}
                onChange={(value) => update({ value })}
              />
            </fieldset>
          </section>
        ) : (
          <section className="card connect-card">
            <span className="eyebrow">Step one</span>
            <h3>Connect the keyboard</h3>
            <ol className="steps">
              <li>Use the cable, or plug in the 2.4G receiver. Move the mode switch to USB or 2.4G.</li>
              <li>
                Press <strong>Connect</strong>, then pick the device named “87C” in the browser dialog.
              </li>
              <li>Lighting is read from both channels so the panel opens on your current settings.</li>
            </ol>
            <div className="button-row">
              <button type="button" className="btn btn-primary" onClick={onConnect} disabled={connecting}>
                {connecting ? 'Waiting for the keyboard…' : 'Connect keyboard'}
              </button>
              <button type="button" className="btn btn-quiet" onClick={onDemo}>
                Try demo mode
              </button>
            </div>
            <p className="muted small">
              WebHID needs Chrome, Edge or Opera on desktop. Firefox and Safari can open the page but
              cannot reach the lighting controls. Nothing is installed and no data leaves this browser.
            </p>
          </section>
        )}

        <PresetsCard
          store={presets}
          lighting={lighting}
          zones={zones}
          connected={connected}
          defaultName={effect.name}
          zoneLabel={zone.label}
          onApplyPreset={applyPreset}
          onApplyBoard={(keys, side) => applyZones({ keys, side })}
        />
      </div>
    </div>
  )
}

interface PresetsCardProps {
  store: PresetStore
  lighting: Lighting
  zones: ZoneLighting
  connected: boolean
  defaultName: string
  zoneLabel: string
  onApplyPreset: (preset: Preset) => void
  onApplyBoard: (keys: Lighting, side: Lighting) => void
}

function PresetsCard({
  store,
  lighting,
  zones,
  connected,
  defaultName,
  zoneLabel,
  onApplyPreset,
  onApplyBoard,
}: PresetsCardProps) {
  const [name, setName] = useState('')
  const [saveScope, setSaveScope] = useState<PresetScope>('board')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const save = () => {
    const label = name.trim() || defaultName
    const ok =
      saveScope === 'board'
        ? store.add(label, zones.keys, zones.side)
        : store.add(label, lighting)
    setName('')
    setNote(
      ok
        ? `Saved “${label}” (${saveScope === 'board' ? 'keys + side' : zoneLabel.toLowerCase()}).`
        : 'Could not save: browser storage is full or blocked.',
    )
  }

  const commitRename = (id: string) => {
    const trimmed = editName.trim()
    if (trimmed) {
      store.rename(id, trimmed)
      setNote(`Renamed to “${trimmed}”.`)
    }
    setEditingId(null)
    setEditName('')
  }

  return (
    <section className="card">
      <div className="card-head">
        <h3>Presets</h3>
        <span className="muted small">{store.presets.length} saved</span>
      </div>

      <div className="save-row">
        <input
          className="text-input"
          type="text"
          placeholder={defaultName}
          value={name}
          maxLength={40}
          aria-label="Preset name"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save()
          }}
        />
        <button type="button" className="btn btn-primary" onClick={save} disabled={!connected}>
          Save
        </button>
      </div>

      <div className="scope-row" role="group" aria-label="Save scope">
        <button
          type="button"
          className={`pill${saveScope === 'board' ? ' is-active' : ''}`}
          aria-pressed={saveScope === 'board'}
          onClick={() => setSaveScope('board')}
        >
          Full board (keys + side)
        </button>
        <button
          type="button"
          className={`pill${saveScope === 'zone' ? ' is-active' : ''}`}
          aria-pressed={saveScope === 'zone'}
          onClick={() => setSaveScope('zone')}
        >
          Current zone only
        </button>
      </div>

      {store.presets.length ? (
        <ul className="preset-list">
          {store.presets.map((preset) => {
            const isEditing = editingId === preset.id
            const isBoard = preset.scope === 'board' && Boolean(preset.sideLighting)
            return (
              <li key={preset.id}>
                <span className="preset-swatches">
                  <span
                    className="swatch swatch-small"
                    title="Keys color"
                    style={{
                      background: hsvToCss(
                        preset.lighting.hue,
                        preset.lighting.saturation,
                        preset.lighting.value,
                      ),
                    }}
                  />
                  {isBoard && preset.sideLighting ? (
                    <span
                      className="swatch swatch-small"
                      title="Side panel color"
                      style={{
                        background: hsvToCss(
                          preset.sideLighting.hue,
                          preset.sideLighting.saturation,
                          preset.sideLighting.value,
                        ),
                      }}
                    />
                  ) : null}
                </span>

                {isEditing ? (
                  <input
                    className="text-input preset-edit-input"
                    type="text"
                    value={editName}
                    maxLength={40}
                    autoFocus
                    aria-label="Rename preset"
                    onChange={(event) => setEditName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitRename(preset.id)
                      if (event.key === 'Escape') setEditingId(null)
                    }}
                    onBlur={() => commitRename(preset.id)}
                  />
                ) : (
                  <div className="preset-meta">
                    <span className="preset-name">{preset.name}</span>
                    <span className="preset-sub">
                      {isBoard ? 'Full board' : 'Single zone'} · {effectById(preset.lighting.effect).name}
                    </span>
                  </div>
                )}

                <div className="preset-actions">
                  <button
                    type="button"
                    className="link"
                    disabled={!connected}
                    onClick={() => onApplyPreset(preset)}
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    className="link link-quiet"
                    disabled={!connected}
                    title="Overwrite with current lighting"
                    onClick={() => {
                      if (isBoard) {
                        store.overwrite(preset.id, zones.keys, zones.side)
                      } else {
                        store.overwrite(preset.id, lighting)
                      }
                      setNote(`Updated “${preset.name}”.`)
                    }}
                  >
                    Update
                  </button>
                  <button
                    type="button"
                    className="link link-quiet"
                    onClick={() => {
                      setEditingId(preset.id)
                      setEditName(preset.name)
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="link link-quiet"
                    onClick={() => store.remove(preset.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="muted small preset-empty">
          Save single-zone presets or full dual-zone board profiles in this browser. Applying a
          single-zone preset writes to {zoneLabel.toLowerCase()}.
        </p>
      )}

      {note ? <p className="muted small preset-note">{note}</p> : null}

      <div className="button-row">
        <button
          type="button"
          className="btn btn-quiet"
          disabled={!store.presets.length}
          onClick={() => downloadPresets(store.presets)}
        >
          Export JSON
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => fileInput.current?.click()}
        >
          Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            const added = store.importFromText(await file.text())
            setNote(
              added === null
                ? 'That file did not contain WK87 presets.'
                : added === 0
                  ? 'Those presets are already saved.'
                  : `Imported ${added} preset${added === 1 ? '' : 's'}.`,
            )
          }}
        />
      </div>

      <div className="starter-block">
        <span className="eyebrow">Starter profiles</span>
        <ul className="starter-list">
          {STARTER_PRESETS.map((starter) => (
            <li key={starter.id}>
              <span className="preset-swatches">
                <span
                  className="swatch swatch-small"
                  style={{
                    background: hsvToCss(
                      starter.lighting.hue,
                      starter.lighting.saturation,
                      starter.lighting.value,
                    ),
                  }}
                />
                <span
                  className="swatch swatch-small"
                  style={{
                    background:
                      starter.sideLighting.effect === 0
                        ? 'var(--line-strong)'
                        : hsvToCss(
                            starter.sideLighting.hue,
                            starter.sideLighting.saturation,
                            starter.sideLighting.value,
                          ),
                  }}
                />
              </span>
              <div className="preset-meta">
                <span className="preset-name">{starter.name}</span>
                <span className="preset-sub">{starter.caption}</span>
              </div>
              <div className="preset-actions">
                <button
                  type="button"
                  className="link"
                  disabled={!connected}
                  onClick={() => onApplyBoard(starter.lighting, starter.sideLighting)}
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="link link-quiet"
                  onClick={() => {
                    store.add(starter.name, starter.lighting, starter.sideLighting)
                    setNote(`Added “${starter.name}” to your presets.`)
                  }}
                >
                  Save
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
