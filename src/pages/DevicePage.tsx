import { useState } from 'react'
import { CopyButton } from '../components/CopyButton'
import { effectById } from '../core/effects'
import { BLOCKED, LIGHTING_CHANNELS, VENDOR_ID, PRODUCT_ID, type LightingTarget } from '../core/protocol'
import type { DeviceDescriptor, Lighting } from '../core/types'
import type { LightingController } from '../hooks/useLighting'
import type { PresetStore } from '../hooks/usePresets'

interface DevicePageProps {
  descriptor: DeviceDescriptor | null
  connected: boolean
  connecting: boolean
  controller: LightingController
  presets: PresetStore
  lightTarget: LightingTarget
  onConnect: () => void
  onDemo: () => void
  onDisconnect: () => void
}

const RECOVERY_COMMAND = 'wb32-dfu-updater_cli.exe -R'
const hex = (value: number) => `0x${value.toString(16).toUpperCase().padStart(4, '0')}`

const TRANSPORT_LABEL: Record<string, string> = {
  usb: 'Wired USB',
  '2.4g': '2.4G receiver',
  demo: 'Demo (simulated)',
}

function ZoneReadbackTable({ label, values }: { label: string; values: Lighting }) {
  const effect = effectById(values.effect)
  return (
    <div className="zone-readback">
      <h4>{label}</h4>
      <dl className="spec spec-tight">
        <div>
          <dt>Brightness</dt>
          <dd>
            {values.brightness} <span className="muted">/ 255</span>
          </dd>
        </div>
        <div>
          <dt>Effect</dt>
          <dd>
            {effect.name} <span className="muted">#{values.effect}</span>
          </dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{values.speed}</dd>
        </div>
        <div>
          <dt>Color</dt>
          <dd>
            <code>
              H {values.hue} S {values.saturation} V {values.value}
            </code>
          </dd>
        </div>
      </dl>
    </div>
  )
}

export function DevicePage({
  descriptor,
  connected,
  connecting,
  controller,
  presets,
  onConnect,
  onDemo,
  onDisconnect,
}: DevicePageProps) {
  const [pinging, setPinging] = useState(false)
  const [pingResult, setPingResult] = useState<number | null>(null)

  const keyValues = controller.echoZones.keys ?? controller.zones.keys
  const sideValues = controller.echoZones.side ?? controller.zones.side
  const transport = descriptor ? (TRANSPORT_LABEL[descriptor.transport] ?? descriptor.transport) : '—'

  const runPing = async () => {
    setPinging(true)
    const ms = await controller.ping()
    setPingResult(ms)
    setPinging(false)
  }

  return (
    <div className="page">
      <section className="card">
        <div className="card-head">
          <div>
            <span className="eyebrow">Device</span>
            <h2>{connected ? (descriptor?.productName ?? 'WK87') : 'No keyboard connected'}</h2>
          </div>
          <span className={`status ${connected ? 'status-ready' : 'status-idle'}`}>
            {connected ? 'Connected' : 'Offline'}
          </span>
        </div>

        <dl className="spec">
          <div>
            <dt>USB ID</dt>
            <dd>
              <code>
                {hex(descriptor?.vendorId ?? VENDOR_ID).slice(2)}:
                {hex(descriptor?.productId ?? PRODUCT_ID).slice(2)}
              </code>
            </dd>
          </div>
          <div>
            <dt>Transport</dt>
            <dd>{transport}</dd>
          </div>
          <div>
            <dt>VIA protocol</dt>
            <dd>
              <code>{descriptor ? hex(descriptor.protocolVersion) : '—'}</code>
              {descriptor ? <span className="muted"> ({descriptor.protocolVersion})</span> : null}
            </dd>
          </div>
          <div>
            <dt>Vendor collection</dt>
            <dd>
              <code>0xFF60 / 0x61</code>
            </dd>
          </div>
          <div>
            <dt>Report</dt>
            <dd>
              <code>32 bytes, ID 0</code>
            </dd>
          </div>
          <div>
            <dt>HID collections</dt>
            <dd>{descriptor ? descriptor.collections : '—'}</dd>
          </div>
          <div>
            <dt>Last HID latency</dt>
            <dd>
              {pingResult !== null
                ? `${pingResult} ms (0x01 ping)`
                : controller.lastLatencyMs !== null
                  ? `${controller.lastLatencyMs} ms`
                  : '—'}
            </dd>
          </div>
          <div>
            <dt>Battery</dt>
            <dd>
              Not reported <span className="muted">(no battery device in Windows)</span>
            </dd>
          </div>
        </dl>

        <div className="button-row">
          {connected ? (
            <>
              <button type="button" className="btn btn-quiet" onClick={controller.refresh}>
                Read both channels
              </button>
              <button
                type="button"
                className="btn btn-quiet"
                disabled={pinging}
                onClick={runPing}
              >
                {pinging ? 'Pinging…' : 'Ping latency (0x01)'}
              </button>
              <button type="button" className="btn btn-quiet" onClick={onDisconnect}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={onConnect} disabled={connecting}>
                {connecting ? 'Waiting for the keyboard…' : 'Connect keyboard'}
              </button>
              <button type="button" className="btn btn-quiet" onClick={onDemo}>
                Try demo mode
              </button>
            </>
          )}
          <a className="btn btn-quiet" href="./tools/probe.html" target="_blank" rel="noreferrer">
            Open read-only probe
          </a>
        </div>
      </section>

      <div className="page-columns">
        <section className="card">
          <div className="card-head">
            <h3>Dual-zone readback</h3>
            <span className="muted small">Channels {LIGHTING_CHANNELS.keys} &amp; {LIGHTING_CHANNELS.side}</span>
          </div>
          {connected ? (
            <div className="dual-readback">
              <ZoneReadbackTable
                label={`Channel ${LIGHTING_CHANNELS.keys} · Key backlight`}
                values={keyValues}
              />
              <ZoneReadbackTable
                label={`Channel ${LIGHTING_CHANNELS.side} · Side panel`}
                values={sideValues}
              />
            </div>
          ) : (
            <p className="muted small">Connect the keyboard to read lighting values from both channels.</p>
          )}
          <p className="muted small note-gap">
            The firmware answers one step below the value that was written for brightness (send 100,
            read 99). That is a firmware quirk, not a failed write, so this app treats the readback as
            confirmation rather than a correction.
          </p>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Stored data</h3>
            <span className="muted small">{presets.presets.length} presets</span>
          </div>
          <p className="muted small">
            Presets live in this browser’s local storage. There is no account, no server and no
            telemetry: clearing site data removes everything.
          </p>
          <button
            type="button"
            className="btn btn-quiet"
            disabled={!presets.presets.length}
            onClick={() => {
              if (window.confirm('Delete all saved presets from this browser?')) presets.clear()
            }}
          >
            Delete all presets
          </button>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <span className="eyebrow">Safety</span>
            <h2>What this app is allowed to send</h2>
          </div>
        </div>
        <p>
          The WK87 does not run real VIA firmware. It answers the handshake and lighting commands on
          exactly two channels — {LIGHTING_CHANNELS.keys} for the key backlight and{' '}
          {LIGHTING_CHANNELS.side} for the side panel. Channels 0, 1, 4 and 5 stay silent, and several
          standard VIA commands do something else entirely. This app refuses anything that has not been
          verified on the hardware — the allowlist is enforced in code, not by good intentions.
        </p>

        <div className="safety-grid">
          <div>
            <h4 className="tag tag-good">Allowed</h4>
            <ul className="bullets">
              <li>
                <code>0x01</code> — protocol version handshake
              </li>
              <li>
                <code>0x08</code> — read lighting value (channels {LIGHTING_CHANNELS.keys} and{' '}
                {LIGHTING_CHANNELS.side}, ids 1–4)
              </li>
              <li>
                <code>0x07</code> — write lighting value (channels {LIGHTING_CHANNELS.keys} and{' '}
                {LIGHTING_CHANNELS.side}, ids 1–4)
              </li>
            </ul>
          </div>
          <div>
            <h4 className="tag tag-bad">Never sent</h4>
            <ul className="bullets">
              {BLOCKED.map((command) => (
                <li key={command.code}>
                  <code>{command.label}</code> — {command.reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <span className="eyebrow">Recovery</span>
            <h2>If the keyboard stops typing</h2>
          </div>
        </div>
        <p>
          If a tool sends the WK87 into its WB32 bootloader, Windows shows{' '}
          <code>WB Device in DFU Mode</code> (<code>USB\VID_342D&amp;PID_DFA0</code>). The bootloader
          stays put until it is explicitly told to run, so unplugging does not help. No firmware is
          erased by this: the keyboard is waiting, not broken.
        </p>
        <ol className="steps">
          <li>
            Install the official WB32 WinUSB driver once (
            <a href="https://github.com/WestberryTech/wb32-dfu-updater" target="_blank" rel="noreferrer">
              WestberryTech/wb32-dfu-updater
            </a>
            ). Windows needs it before any tool can reach the bootloader.
          </li>
          <li>Open a terminal in the folder that contains the updater.</li>
          <li>
            Run the command below. <code>Reset device completed!</code> means the keyboard is back.
          </li>
        </ol>
        <div className="command-row">
          <code className="command">{RECOVERY_COMMAND}</code>
          <CopyButton text={RECOVERY_COMMAND} />
        </div>
        <p className="muted small">
          <code>Not found device!</code> means the driver step was skipped. This app never sends the
          bootloader command, so it cannot put your keyboard there.
        </p>
      </section>
    </div>
  )
}
