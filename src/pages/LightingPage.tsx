import { useRef, useState } from 'react'
import { KeyboardStage } from '../components/KeyboardStage'
import { RangeField } from '../components/RangeField'
import { HUE_GRADIENT, hsvToCss, hueDegrees } from '../core/colors'
import { EFFECTS, effectById } from '../core/effects'
import { downloadPresets } from '../core/presets'
import type { DeviceDescriptor, Lighting } from '../core/types'
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
  const { lighting, echo, status, error, update, refresh } = controller
  const effect = effectById(lighting.effect)
  const demo = descriptor?.transport === 'demo'
  const zone = ZONES.find((item) => item.id === lightTarget) ?? ZONES[0]

  return (
    <div className="page">
      <section className="card stage-card">
        <div className="card-head">
          <div>
            <span className="eyebrow">Preview</span>
            <h2>{connected ? effect.name : 'Lighting'}</h2>
          </div>
          <span className={`status status-${connected ? status : 'idle'}`}>
            {connected ? STATUS_TEXT[status] : 'Not connected'}
          </span>
        </div>

        <KeyboardStage lighting={lighting} idle={!connected} target={lightTarget} />

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
            </span>
            {echo ? (
              <span>
                Readback ({lightTarget === 'both' ? `channel ${LIGHTING_CHANNELS.keys}` : zone.label}):
                brightness {echo.brightness} · speed {echo.speed} · effect{' '}
                {effectById(echo.effect).name}
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
              <span className="field-label">Lighting zone</span>
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

            <label className="field">
              <span className="field-label">Effect</span>
              <select
                className="select"
                value={lighting.effect}
                onChange={(event) => update({ effect: Number(event.target.value) })}
              >
                {EFFECTS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

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

              <div className="color-preview">
                <span
                  className="swatch"
                  style={{
                    background: hsvToCss(lighting.hue, lighting.saturation, lighting.value),
                  }}
                />
                <span className="muted small">
                  HSV {lighting.hue}, {lighting.saturation}, {lighting.value}
                </span>
              </div>
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
              <li>Lighting is read from the keyboard so the panel opens on your current settings.</li>
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
          connected={connected}
          defaultName={effect.name}
          zoneLabel={zone.label}
          onApply={update}
        />
      </div>
    </div>
  )
}

interface PresetsCardProps {
  store: PresetStore
  lighting: Lighting
  connected: boolean
  defaultName: string
  zoneLabel: string
  onApply: (lighting: Lighting) => void
}

function PresetsCard({ store, lighting, connected, defaultName, zoneLabel, onApply }: PresetsCardProps) {
  const [name, setName] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const save = () => {
    const label = name.trim() || defaultName
    const ok = store.add(label, lighting)
    setName('')
    setNote(ok ? `Saved “${label}”.` : 'Could not save: browser storage is full or blocked.')
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
          Save current
        </button>
      </div>

      {store.presets.length ? (
        <ul className="preset-list">
          {store.presets.map((preset) => (
            <li key={preset.id}>
              <span
                className="swatch swatch-small"
                style={{
                  background: hsvToCss(preset.lighting.hue, preset.lighting.saturation, preset.lighting.value),
                }}
              />
              <span className="preset-name">{preset.name}</span>
              <button
                type="button"
                className="link"
                disabled={!connected}
                onClick={() => onApply(preset.lighting)}
              >
                Apply
              </button>
              <button type="button" className="link link-quiet" onClick={() => store.remove(preset.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">
          Presets keep the four lighting values — effect, brightness, speed and color — in this browser.
          Applying one writes to the selected zone, currently {zoneLabel.toLowerCase()}. Save your
          favourites before experimenting.
        </p>
      )}

      {note ? <p className="muted small">{note}</p> : null}

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
    </section>
  )
}
