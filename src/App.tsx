import { useCallback, useEffect, useRef, useState } from 'react'
import { DemoClient } from './core/demo'
import {
  VENDOR_ID,
  Wk87Client,
  Wk87Error,
  errorMessage,
  requestKeyboard,
  supportsWebHid,
  type LightingClient,
} from './core/protocol'
import { useLighting } from './hooks/useLighting'
import { usePresets } from './hooks/usePresets'
import type { LightingTarget } from './core/protocol'
import { DevicePage } from './pages/DevicePage'
import { LightingPage } from './pages/LightingPage'
import { ShortcutsPage } from './pages/ShortcutsPage'
import { TesterPage } from './pages/TesterPage'

type Tab = 'lighting' | 'tester' | 'shortcuts' | 'device'
type Theme = 'light' | 'dark'
interface Notice {
  tone: 'info' | 'error'
  text: string
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'lighting', label: 'Lighting' },
  { id: 'tester', label: 'Key tester' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'device', label: 'Device' },
]

const THEME_KEY = 'wk87.theme'

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // storage may be blocked; fall through to the system preference
  }
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function App() {
  const [tab, setTab] = useState<Tab>('lighting')
  const [theme, setTheme] = useState<Theme>(readTheme)
  const [client, setClient] = useState<LightingClient | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [lightTarget, setLightTarget] = useState<LightingTarget>('keys')

  const clientRef = useRef<LightingClient | null>(null)
  const hidRef = useRef<HIDDevice | null>(null)
  const bootstrapped = useRef(false)

  const lighting = useLighting(client, lightTarget)
  const presets = usePresets()
  const connected = client !== null
  const hidSupported = supportsWebHid()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // not fatal: the theme just will not be remembered
    }
  }, [theme])

  const adopt = useCallback((next: LightingClient | null) => {
    const previous = clientRef.current
    clientRef.current = next
    setClient(next)
    if (previous && previous !== next) void previous.close()
  }, [])

  const onHidDisconnect = useCallback(() => {
    hidRef.current = null
    adopt(null)
    setNotice({ tone: 'error', text: 'Keyboard disconnected. Plug it back in and connect again.' })
  }, [adopt])

  const openDevice = useCallback(
    async (device: HIDDevice) => {
      const next = await Wk87Client.open(device)
      device.addEventListener('disconnect', onHidDisconnect)
      hidRef.current = device
      adopt(next)
    },
    [adopt, onHidDisconnect],
  )

  useEffect(() => {
    if (bootstrapped.current || !supportsWebHid()) return
    bootstrapped.current = true
    let cancelled = false
    navigator.hid
      .getDevices()
      .then(async (devices) => {
        const granted = devices.find((device) => device.vendorId === VENDOR_ID)
        if (!granted || cancelled) return
        setConnecting(true)
        try {
          await openDevice(granted)
        } catch {
          // silent: the user can always connect manually
        } finally {
          if (!cancelled) setConnecting(false)
        }
      })
      .catch(() => undefined)
  }, [openDevice])

  const connect = useCallback(async () => {
    if (!hidSupported) {
      setNotice({
        tone: 'error',
        text: 'This browser does not expose WebHID. Use Chrome, Edge or Opera on desktop, or try demo mode.',
      })
      return
    }
    setConnecting(true)
    try {
      const device = await requestKeyboard()
      await openDevice(device)
      setNotice(null)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        setNotice(null)
      } else if (error instanceof Wk87Error && error.kind === 'device') {
        setNotice(null)
      } else {
        setNotice({ tone: 'error', text: errorMessage(error) })
      }
    } finally {
      setConnecting(false)
    }
  }, [hidSupported, openDevice])

  const startDemo = useCallback(() => {
    if (hidRef.current) {
      hidRef.current.removeEventListener('disconnect', onHidDisconnect)
      hidRef.current = null
    }
    adopt(new DemoClient())
    setNotice({
      tone: 'info',
      text: 'Demo mode: every change is simulated in this tab. Nothing is written to hardware.',
    })
  }, [adopt, onHidDisconnect])

  const disconnect = useCallback(() => {
    if (hidRef.current) {
      hidRef.current.removeEventListener('disconnect', onHidDisconnect)
      hidRef.current = null
    }
    adopt(null)
    setNotice(null)
  }, [adopt, onHidDisconnect])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div className="brand-text">
            <h1>WK87 Control</h1>
            <p>Unofficial, local-only panel for the Weikav WK87</p>
          </div>
        </div>

        <div className="header-actions">
          <span className={`device-pill${connected ? ' is-on' : ''}`}>
            <span className="dot" aria-hidden="true" />
            {connected
              ? client?.descriptor.transport === 'demo'
                ? 'Demo device'
                : client?.descriptor.transport === '2.4g'
                  ? '2.4G · connected'
                  : 'Wired · connected'
              : 'No device'}
          </span>
          {connected ? (
            <button type="button" className="btn btn-quiet" onClick={disconnect}>
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={connect}
              disabled={connecting || !hidSupported}
            >
              {connecting ? 'Connecting…' : 'Connect'}
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tab${tab === item.id ? ' is-active' : ''}`}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {notice ? (
        <div className={`notice notice-${notice.tone}`} role="status">
          <span>{notice.text}</span>
          <button type="button" className="link" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <main>
        {tab === 'lighting' ? (
          <LightingPage
            descriptor={client?.descriptor ?? null}
            controller={lighting}
            connected={connected}
            connecting={connecting}
            onConnect={connect}
            onDemo={startDemo}
            presets={presets}
            lightTarget={lightTarget}
            onLightTarget={setLightTarget}
          />
        ) : null}

        {tab === 'tester' ? <TesterPage /> : null}
        {tab === 'shortcuts' ? <ShortcutsPage /> : null}

        {tab === 'device' ? (
          <DevicePage
            descriptor={client?.descriptor ?? null}
            connected={connected}
            connecting={connecting}
            controller={lighting}
            presets={presets}
            lightTarget={lightTarget}
            onConnect={connect}
            onDemo={startDemo}
            onDisconnect={disconnect}
          />
        ) : null}
      </main>

      <footer className="app-footer">
        <span>MIT licensed. Not affiliated with Weikav.</span>
        <span>
          Writes are limited to the two lighting channels. Firmware, keymap and macros are never touched.
        </span>
      </footer>
    </div>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  )
}
