interface Chord {
  keys: string[]
  caption: string
  detail: string
}

const CHORDS: Chord[] = [
  {
    keys: ['Fn', 'Win'],
    caption: 'Toggle the Windows key lock',
    detail:
      'Confirmed on the WK87. When the lock is on, the Windows key is filtered inside the keyboard, so Windows never sees it. The setting survives reboots and cable changes.',
  },
]

export function ShortcutsPage() {
  return (
    <div className="page">
      <section className="card">
        <span className="eyebrow">Shortcuts</span>
        <h2>The combinations that matter</h2>
        <p>
          The WK87 handles its Fn layer internally. Windows never receives those keystrokes, which is
          why no web tool can display or remap them. The entry below is the one this project has
          actually verified; the rest are printed on the keycaps and in the manual.
        </p>

        <ul className="chord-list">
          {CHORDS.map((chord) => (
            <li key={chord.caption}>
              <div className="chord">
                {chord.keys.map((key, index) => (
                  <span key={key} className="chord-part">
                    {index > 0 ? <span className="chord-plus">+</span> : null}
                    <kbd className="kbd">{key}</kbd>
                  </span>
                ))}
              </div>
              <div>
                <strong>{chord.caption}</strong>
                <p className="muted small">{chord.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="page-columns">
        <section className="card">
          <h3>Windows key is locked. Now what?</h3>
          <p>
            There is no software escape hatch. The lock lives in the keyboard firmware and only the
            chord above clears it — that is exactly why the panel cannot offer a “unlock” button and
            why this app does not pretend to.
          </p>
          <p className="muted small">
            If you need a Windows key without unlocking, the Windows companion app{' '}
            <strong>WK87 Remap</strong> (included in <code>desktop/</code>) remaps{' '}
            <kbd className="kbd">Caps Lock</kbd> → <kbd className="kbd">Win</kbd> at OS level (Win
            Rescue), adds per-key remaps and Game Mode (<kbd className="kbd">Ctrl</kbd> +{' '}
            <kbd className="kbd">Alt</kbd> + <kbd className="kbd">G</kbd>), and pauses all remaps if
            you hold physical <kbd className="kbd">Esc</kbd> for 3 seconds.
          </p>
        </section>

        <section className="card">
          <h3>Mode switch</h3>
          <p>
            The switch on the keyboard selects USB, 2.4G, Bluetooth or off. The app works over USB and
            the 2.4G receiver; Bluetooth is not reachable from a browser.
          </p>
          <ul className="bullets">
            <li>Wired: switch to USB, then connect the cable.</li>
            <li>2.4G: switch to 2.4G with the receiver plugged in.</li>
            <li>Bluetooth: pairs natively; lighting control is unavailable.</li>
          </ul>
          <p className="muted small">
            On 2.4G the keyboard sleeps when idle. If a read times out, press any key and try again.
          </p>
        </section>
      </div>

      <section className="card">
        <h3>If a key seems dead</h3>
        <ol className="steps">
          <li>
            Unlock the Windows key with <kbd className="kbd">Fn</kbd> + <kbd className="kbd">Win</kbd>.
          </li>
          <li>Check the mode switch and whether the cable or receiver is connected.</li>
          <li>Open the Key tester tab and press the key: if it appears there, Windows is the problem.</li>
          <li>
            If the keyboard stops appearing as <code>87C</code> and instead shows up as{' '}
            <code>WB Device in DFU Mode</code>, follow the recovery steps in the Device tab.
          </li>
        </ol>
        <p className="muted small">
          This page only claims what was tested on a real WK87. If your unit differs, the manual is
          the better source.
        </p>
      </section>
    </div>
  )
}
