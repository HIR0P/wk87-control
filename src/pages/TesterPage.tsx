import { useEffect, useRef, useState } from 'react'
import { keyLabel, locationName } from '../core/keyLabels'

interface LastKey {
  code: string
  key: string
  location: number
}

const CHATTER_GAP_MS = 45
const MAX_ALERTS = 4

export function TesterPage() {
  const [held, setHeld] = useState<string[]>([])
  const [last, setLast] = useState<LastKey | null>(null)
  const [presses, setPresses] = useState(0)
  const [chatter, setChatter] = useState(0)
  const [alerts, setAlerts] = useState<string[]>([])
  const [fastest, setFastest] = useState<number | null>(null)

  const downs = useRef(new Set<string>())
  const lastDown = useRef(new Map<string, number>())
  const chatterCount = useRef(0)

  useEffect(() => {
    const flag = (code: string, gap: number) => {
      chatterCount.current += 1
      setChatter(chatterCount.current)
      setAlerts((previous) =>
        [
          `${keyLabel(code)} fired twice${gap > 0 ? ` within ${Math.round(gap)} ms` : ' without a release'}`,
          ...previous,
        ].slice(0, MAX_ALERTS),
      )
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') event.preventDefault()
      if (event.repeat || !event.code) return

      const now = performance.now()
      const previous = lastDown.current.get(event.code)
      if (previous !== undefined) {
        const gap = now - previous
        setFastest((current) => (current === null ? gap : Math.min(current, gap)))
        if (gap < CHATTER_GAP_MS) flag(event.code, gap)
      }

      lastDown.current.set(event.code, now)
      if (downs.current.has(event.code)) {
        flag(event.code, 0)
      } else {
        downs.current.add(event.code)
      }

      setHeld(Array.from(downs.current))
      setPresses((count) => count + 1)
      setLast({ code: event.code, key: event.key, location: event.location })
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (!event.code) return
      downs.current.delete(event.code)
      setHeld(Array.from(downs.current))
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
    lastDown.current.clear()
    chatterCount.current = 0
    setHeld([])
    setLast(null)
    setPresses(0)
    setChatter(0)
    setAlerts([])
    setFastest(null)
  }

  return (
    <div className="page">
      <section className="card tester-card">
        <div className="card-head">
          <div>
            <span className="eyebrow">Key tester</span>
            <h2>{last ? keyLabel(last.code, last.key) : 'Press any key'}</h2>
          </div>
          <span className={`status ${held.length ? 'status-applying' : 'status-ready'}`}>
            {held.length ? `${held.length} held` : 'Listening'}
          </span>
        </div>

        <div className="readout">
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
        </div>

        <div className="held-row">
          {held.length ? (
            held.map((code) => (
              <kbd key={code} className="kbd">
                {keyLabel(code)}
              </kbd>
            ))
          ) : (
            <span className="muted small">Nothing is held down. Click on the page first, then type.</span>
          )}
        </div>
      </section>

      <div className="page-columns">
        <section className="card">
          <div className="card-head">
            <h3>Session</h3>
            <button type="button" className="link" onClick={reset}>
              Reset
            </button>
          </div>
          <dl className="stats">
            <div>
              <dt>Key presses</dt>
              <dd>{presses}</dd>
            </div>
            <div>
              <dt>Fastest repeat</dt>
              <dd>{fastest === null ? '—' : `${Math.round(fastest)} ms`}</dd>
            </div>
            <div>
              <dt>Chatter flags</dt>
              <dd className={chatter ? 'is-bad' : undefined}>{chatter}</dd>
            </div>
          </dl>
          <p className="muted small">
            The fastest repeat is measured between two presses of the same key. Human double-taps
            below 45 ms are unusual, so they are flagged.
          </p>
        </section>

        <section className="card">
          <h3>Chatter check</h3>
          {alerts.length ? (
            <ul className="alert-list">
              {alerts.map((alert) => (
                <li key={alert}>{alert}</li>
              ))}
            </ul>
          ) : (
            <p className="muted small">
              No double presses detected. Hold a key and wiggle it to provoke switch chatter.
            </p>
          )}
          <p className="muted small">
            Chatter is a switch that makes contact twice per press. The keyboard cannot be fixed by
            software: a hot-swap replacement is the cure.
          </p>
        </section>
      </div>

      <section className="card note-card">
        <h3>What this can and cannot see</h3>
        <ul className="bullets">
          <li>The tester listens to normal browser key events, not to the keyboard’s internal matrix.</li>
          <li>
            If a key never appears, the firmware may be swallowing it. A Windows key locked with{' '}
            <kbd className="kbd">Fn</kbd> + <kbd className="kbd">Win</kbd> behaves exactly like that.
          </li>
          <li>Fn combinations are resolved inside the keyboard, so Windows never sees them here.</li>
          <li>Everything stays on this machine. No keystrokes are stored or sent anywhere.</li>
        </ul>
      </section>
    </div>
  )
}
