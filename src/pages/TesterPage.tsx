import { useEffect, useMemo, useRef, useState } from 'react'
import { CopyButton } from '../components/CopyButton'
import { keyLabel, locationName } from '../core/keyLabels'
import { BOARD_KEYS, BOARD_UNITS, TESTABLE_CODES, TESTABLE_KEY_COUNT } from '../core/layout'

interface LastKey {
  code: string
  key: string
  location: number
  holdMs: number | null
  bounceMs: number | null
}

interface ChatterAlert {
  id: number
  code: string
  message: string
}

interface KeyEventLog {
  id: number
  code: string
  label: string
  bounceMs: number | null
  holdMs: number | null
  flagged: boolean
}

const CHATTER_GAP_MS = 45
const MAX_ALERTS = 8
const MAX_EVENTS = 14

const CAPTURE_CODES = new Set([
  'Space',
  'Tab',
  'AltLeft',
  'AltRight',
  'ContextMenu',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'Backspace',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
])

export function TesterPage() {
  const [held, setHeld] = useState<string[]>([])
  const [tested, setTested] = useState<string[]>([])
  const [chatteredKeys, setChatteredKeys] = useState<string[]>([])
  const [last, setLast] = useState<LastKey | null>(null)
  const [presses, setPresses] = useState(0)
  const [peakRollover, setPeakRollover] = useState(0)
  const [chatter, setChatter] = useState(0)
  const [alerts, setAlerts] = useState<ChatterAlert[]>([])
  const [events, setEvents] = useState<KeyEventLog[]>([])
  const [fastestRepeat, setFastestRepeat] = useState<number | null>(null)
  const [fastestBounce, setFastestBounce] = useState<number | null>(null)
  const [captureKeys, setCaptureKeys] = useState(true)

  const downs = useRef(new Set<string>())
  const testedSet = useRef(new Set<string>())
  const chatteredSet = useRef(new Set<string>())
  const lastDown = useRef(new Map<string, number>())
  const lastUp = useRef(new Map<string, number>())
  const activeEventId = useRef(new Map<string, number>())
  const chatterCount = useRef(0)
  const nextId = useRef(1)
  const captureRef = useRef(captureKeys)
  captureRef.current = captureKeys

  useEffect(() => {
    const flag = (code: string, gap: number, kind: 'repeat' | 'bounce' | 'stuck') => {
      chatterCount.current += 1
      chatteredSet.current.add(code)
      setChatter(chatterCount.current)
      setChatteredKeys(Array.from(chatteredSet.current))
      const id = nextId.current++
      const message =
        kind === 'stuck'
          ? `${keyLabel(code)} fired again without a release`
          : kind === 'bounce'
            ? `${keyLabel(code)} bounced after ${Math.round(gap)} ms (up → down)`
            : `${keyLabel(code)} fired twice within ${Math.round(gap)} ms`
      setAlerts((previous) => [{ id, code, message }, ...previous].slice(0, MAX_ALERTS))
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (captureRef.current && (CAPTURE_CODES.has(event.code) || event.altKey)) {
        event.preventDefault()
      } else if (event.code === 'Space') {
        event.preventDefault()
      }
      if (event.repeat || !event.code) return

      const now = performance.now()
      const previousDown = lastDown.current.get(event.code)
      const previousUp = lastUp.current.get(event.code)
      let bounceMs: number | null = null
      let flagged = false

      if (previousUp !== undefined) {
        bounceMs = now - previousUp
        setFastestBounce((current) => (current === null ? bounceMs : Math.min(current, bounceMs as number)))
        if (bounceMs < CHATTER_GAP_MS) {
          flag(event.code, bounceMs, 'bounce')
          flagged = true
        }
      }

      if (previousDown !== undefined) {
        const gap = now - previousDown
        setFastestRepeat((current) => (current === null ? gap : Math.min(current, gap)))
        if (!flagged && gap < CHATTER_GAP_MS) {
          flag(event.code, gap, 'repeat')
          flagged = true
        }
      }

      lastDown.current.set(event.code, now)
      if (downs.current.has(event.code)) {
        flag(event.code, 0, 'stuck')
        flagged = true
      } else {
        downs.current.add(event.code)
      }

      if (TESTABLE_CODES.has(event.code) && !testedSet.current.has(event.code)) {
        testedSet.current.add(event.code)
        setTested(Array.from(testedSet.current))
      }

      const heldList = Array.from(downs.current)
      setHeld(heldList)
      setPeakRollover((current) => Math.max(current, heldList.length))
      setPresses((count) => count + 1)

      const eventId = nextId.current++
      activeEventId.current.set(event.code, eventId)
      const label = keyLabel(event.code, event.key)
      setLast({ code: event.code, key: event.key, location: event.location, holdMs: null, bounceMs })
      setEvents((previous) =>
        [
          {
            id: eventId,
            code: event.code,
            label,
            bounceMs,
            holdMs: null,
            flagged,
          },
          ...previous,
        ].slice(0, MAX_EVENTS),
      )
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (!event.code) return
      const now = performance.now()
      const downAt = lastDown.current.get(event.code)
      const holdMs = downAt !== undefined ? Math.max(0, now - downAt) : null
      lastUp.current.set(event.code, now)
      downs.current.delete(event.code)
      setHeld(Array.from(downs.current))

      if (holdMs !== null) {
        const eventId = activeEventId.current.get(event.code)
        if (eventId !== undefined) {
          activeEventId.current.delete(event.code)
          setEvents((previous) =>
            previous.map((item) => (item.id === eventId ? { ...item, holdMs } : item)),
          )
        }
        setLast((previous) =>
          previous && previous.code === event.code ? { ...previous, holdMs } : previous,
        )
      }
    }

    const onBlur = () => {
      downs.current.clear()
      setHeld([])
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const reset = () => {
    downs.current.clear()
    testedSet.current.clear()
    chatteredSet.current.clear()
    lastDown.current.clear()
    lastUp.current.clear()
    activeEventId.current.clear()
    chatterCount.current = 0
    setHeld([])
    setTested([])
    setChatteredKeys([])
    setLast(null)
    setPresses(0)
    setPeakRollover(0)
    setChatter(0)
    setAlerts([])
    setEvents([])
    setFastestRepeat(null)
    setFastestBounce(null)
  }

  const heldSet = useMemo(() => new Set(held), [held])
  const testedLookup = useMemo(() => new Set(tested), [tested])
  const chatteredLookup = useMemo(() => new Set(chatteredKeys), [chatteredKeys])
  const coveragePct = Math.round((tested.length / TESTABLE_KEY_COUNT) * 100)

  const reportText = useMemo(() => {
    const lines = [
      'WK87 Key Tester Report',
      `Coverage: ${tested.length}/${TESTABLE_KEY_COUNT} browser-visible keys (${coveragePct}%)`,
      `Total presses: ${presses}`,
      `Peak rollover (NKRO): ${peakRollover} simultaneous keys`,
      `Fastest repeat (down->down): ${fastestRepeat === null ? '—' : `${Math.round(fastestRepeat)} ms`}`,
      `Fastest bounce (up->down): ${fastestBounce === null ? '—' : `${Math.round(fastestBounce)} ms`}`,
      `Chatter flags: ${chatter}${chatteredKeys.length ? ` (${chatteredKeys.map((c) => keyLabel(c)).join(', ')})` : ''}`,
    ]
    const untested = BOARD_KEYS.filter(
      (item) => !item.hardwareOnly && item.code && !testedLookup.has(item.code),
    ).map((item) => item.label)
    if (untested.length > 0 && untested.length < TESTABLE_KEY_COUNT) {
      lines.push(`Not yet pressed: ${untested.join(', ')}`)
    }
    return lines.join('\n')
  }, [chatter, chatteredKeys, coveragePct, fastestBounce, fastestRepeat, peakRollover, presses, tested.length, testedLookup])

  return (
    <div className="page">
      <section className="card tester-card">
        <div className="card-head">
          <div>
            <span className="eyebrow">Visual 87-Key Matrix Tester</span>
            <h2>{last ? keyLabel(last.code, last.key) : 'Press any key to begin'}</h2>
          </div>
          <div className="head-controls">
            <button
              type="button"
              className={`chip-btn${captureKeys ? ' is-active' : ''}`}
              aria-pressed={captureKeys}
              onClick={() => setCaptureKeys((value) => !value)}
              title="Prevent Tab, Space, Arrows, and F-keys from scrolling or leaving the page while testing"
            >
              {captureKeys ? 'Capture: On' : 'Capture: Off'}
            </button>
            <button type="button" className="chip-btn" onClick={reset}>
              Reset
            </button>
            <span className={`status ${held.length ? 'status-applying' : 'status-ready'}`}>
              {held.length ? `${held.length} held` : 'Listening'}
            </span>
          </div>
        </div>

        <div className="coverage-bar-wrap">
          <div className="coverage-meta">
            <span>
              Switch coverage: <strong>{tested.length}</strong> / {TESTABLE_KEY_COUNT} browser-visible keys ({coveragePct}%)
            </span>
            <span className="muted small">Fn is handled inside firmware</span>
          </div>
          <div className="coverage-track" aria-hidden="true">
            <span className="coverage-fill" style={{ width: `${coveragePct}%` }} />
          </div>
        </div>

        <div className="stage tester-stage">
          <div className="board tester-board">
            {BOARD_KEYS.map((cap) => {
              const isHeld = cap.code !== null && heldSet.has(cap.code)
              const isTested = cap.code !== null && testedLookup.has(cap.code)
              const isChatter = cap.code !== null && chatteredLookup.has(cap.code)
              const stateClass = cap.hardwareOnly
                ? 'is-firmware'
                : isHeld
                  ? 'is-held'
                  : isChatter
                    ? 'is-chatter'
                    : isTested
                      ? 'is-tested'
                      : 'is-untested'
              return (
                <div
                  key={cap.index}
                  className={`tester-cap ${stateClass}`}
                  title={
                    cap.hardwareOnly
                      ? 'Fn — handled inside keyboard firmware (never sent to OS)'
                      : `${cap.label} (${cap.code})`
                  }
                  style={{
                    left: `calc(${(cap.x / BOARD_UNITS.width) * 100}% + 1px)`,
                    top: `calc(${(cap.y / BOARD_UNITS.height) * 100}% + 1px)`,
                    width: `calc(${(cap.w / BOARD_UNITS.width) * 100}% - 2px)`,
                    height: `calc(${(1 / BOARD_UNITS.height) * 100}% - 2px)`,
                  }}
                >
                  <span>{cap.label}</span>
                </div>
              )
            })}
          </div>
          <div className="tester-legend">
            <span><i className="legend-dot is-untested" aria-hidden="true" /> Untested</span>
            <span><i className="legend-dot is-held" aria-hidden="true" /> Held</span>
            <span><i className="legend-dot is-tested" aria-hidden="true" /> Verified</span>
            <span><i className="legend-dot is-chatter" aria-hidden="true" /> Chatter</span>
            <span><i className="legend-dot is-firmware" aria-hidden="true" /> Firmware (Fn)</span>
          </div>
        </div>

        <div className="readout readout-4">
          <div>
            <span>event.code</span>
            <code>{last?.code ?? '—'}</code>
          </div>
          <div>
            <span>event.key</span>
            <code>{last?.key === ' ' ? 'Space' : (last?.key ?? '—')}</code>
          </div>
          <div>
            <span>location</span>
            <code>{last ? locationName(last.location) : '—'}</code>
          </div>
          <div>
            <span>hold / bounce</span>
            <code>
              {last?.holdMs != null ? `${Math.round(last.holdMs)} ms` : '—'}
              {last?.bounceMs != null ? ` / ${Math.round(last.bounceMs)} ms` : ''}
            </code>
          </div>
        </div>

        <div className="held-row">
          {held.length ? (
            held.map((code) => (
              <kbd key={code} className="kbd">
                {keyLabel(code)}
              </kbd>
            ))
          ) : (
            <span className="muted small">
              Nothing is held down. Click on the page, then press keys across the board to verify every switch.
            </span>
          )}
        </div>
      </section>

      <div className="page-columns">
        <section className="card">
          <div className="card-head">
            <h3>Session metrics</h3>
            <CopyButton text={reportText} label="Copy report" className="link" />
          </div>
          <dl className="stats stats-grid">
            <div>
              <dt>Key presses</dt>
              <dd>{presses}</dd>
            </div>
            <div>
              <dt>Peak rollover</dt>
              <dd>{peakRollover}</dd>
            </div>
            <div>
              <dt>Fastest repeat</dt>
              <dd>{fastestRepeat === null ? '—' : `${Math.round(fastestRepeat)} ms`}</dd>
            </div>
            <div>
              <dt>Fastest bounce</dt>
              <dd>{fastestBounce === null ? '—' : `${Math.round(fastestBounce)} ms`}</dd>
            </div>
            <div>
              <dt>Chatter flags</dt>
              <dd className={chatter ? 'is-bad' : undefined}>{chatter}</dd>
            </div>
            <div>
              <dt>Verified keys</dt>
              <dd>
                {tested.length}/{TESTABLE_KEY_COUNT}
              </dd>
            </div>
          </dl>
          <p className="muted small">
            Repeat measures <code>keydown → keydown</code>; bounce measures <code>keyup → keydown</code> on
            the same switch. Gaps below {CHATTER_GAP_MS} ms are flagged as potential switch chatter.
          </p>
        </section>

        <section className="card">
          <h3>Chatter check &amp; recent events</h3>
          {alerts.length ? (
            <ul className="alert-list">
              {alerts.map((alert) => (
                <li key={alert.id}>{alert.message}</li>
              ))}
            </ul>
          ) : (
            <p className="muted small">
              No double presses detected. Hold a key and lightly wiggle it to provoke switch chatter.
            </p>
          )}

          {events.length ? (
            <div className="event-log" aria-label="Recent key events">
              {events.map((item) => (
                <span key={item.id} className={`event-pill${item.flagged ? ' is-bad' : ''}`}>
                  <strong>{item.label}</strong>
                  {item.holdMs !== null ? ` ${Math.round(item.holdMs)}ms` : ''}
                  {item.bounceMs !== null && item.bounceMs < 250
                    ? ` (Δ${Math.round(item.bounceMs)}ms)`
                    : ''}
                </span>
              ))}
            </div>
          ) : null}

          <p className="muted small note-gap">
            Chatter is a mechanical switch making contact twice per press. Software cannot repair a
            chattering switch: swapping the hot-swap switch is the real fix.
          </p>
        </section>
      </div>

      <section className="card note-card">
        <h3>What this can and cannot see</h3>
        <ul className="bullets">
          <li>The tester listens to normal browser key events, not to the keyboard’s internal matrix.</li>
          <li>
            If the Windows key never lights up, check whether the hardware{' '}
            <kbd className="kbd">Fn</kbd> + <kbd className="kbd">Win</kbd> lock is active.
          </li>
          <li>Fn combinations are resolved inside the keyboard, so Windows never sees them here.</li>
          <li>Everything stays on this machine. No keystrokes are stored or sent anywhere.</li>
        </ul>
      </section>
    </div>
  )
}
