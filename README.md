# WK87 Control

An unofficial, local-only control panel for the **Weikav WK87** mechanical keyboard.

It talks to the keyboard over WebHID: no installer, no account, no backend, no telemetry.
Open the page, press **Connect**, and pick the device named `87C`.

```
Lighting  ·  Key tester  ·  Shortcuts  ·  Device & recovery
```

## What it does

- **Lighting** — 46 firmware effects, brightness, effect speed, and HSV color. The key backlight and
  the side panel are controlled separately: pick **Key backlight**, **Side panel**, or **Both**.
  Changes are written to the keyboard as you move a slider and confirmed by reading the value back.
- **Presets** — save the four lighting values in the browser, apply them later, export/import as
  JSON. Presets never leave your machine.
- **Key tester** — live key readout, held keys, repeat timing and a switch-chatter check.
- **Shortcuts** — the combinations that were actually verified on this board, plus what to do when
  a key appears dead.
- **Device** — transport, protocol version, live readback, the command allowlist, and the exact
  steps that bring a keyboard back from the WB32 bootloader.

Works over **wired USB** and the **2.4G receiver**. Bluetooth is not reachable from a browser.

## What it deliberately does not do

The WK87 does **not** run real VIA firmware. It answers the VIA handshake and the lighting
commands, and stops there. Measured on stock firmware, on both USB and 2.4G:

| VIA command | Result on WK87 |
| --- | --- |
| `0x01` get protocol version | returns `0x000C` |
| `0x08` get lighting value (ch. 3 and ch. 2) | works: brightness, effect, speed, color |
| `0x07` set lighting value (ch. 3 and ch. 2) | works |
| `0x0A` get keycode | always `0x0000` |
| `0x13` get layer count | always `0` |
| `0x0E` / `0x0F` macro count / size | always `0` |
| `0x0B` set keycode (standard VIA) | **jumps to the WB32 bootloader** |

So there is no keymap editor here, and no macro editor. Anyone offering one for this board is
either flashing different firmware or guessing. The honest scope is lighting, diagnostics and
recovery — which is what this app is.

There is also **no battery readout**, because the firmware does not expose one. The keyboard
identifies as a plain HID composite device, Windows lists no battery for it, and no standard HID
battery usage is present. No charge value has been found on any vendor channel or feature report,
so a percentage here would be invented.

The Windows key lock is also a firmware feature: `Fn` + `Win` toggles it, and **no software can
unlock it**. The app says so instead of shipping a fake toggle.

## Safety

Only three commands are allowed by code, not by convention:

- `0x01` protocol handshake
- `0x08` read lighting value (channels 3 and 2, ids 1–4)
- `0x07` write lighting value (channels 3 and 2, ids 1–4)

Everything else is rejected before a single byte reaches the device. `0x0B` is specifically
blocked, because on this firmware it is the bootloader jump — the thing that put a test unit into
DFU mode while this project was being reverse-engineered. Firmware and keymap are never touched.

### If the keyboard stops typing

Windows showing `WB Device in DFU Mode` (`USB\VID_342D&PID_DFA0`) means the WB32 bootloader is
waiting, not that the keyboard is broken. It stays there until told to run, so unplugging does not
help.

1. Install the official [WB32 WinUSB driver](https://github.com/WestberryTech/wb32-dfu-updater)
   once. Windows needs it before any tool can reach the bootloader.
2. Open a terminal in the folder that contains `wb32-dfu-updater_cli.exe`.
3. Run:

```powershell
wb32-dfu-updater_cli.exe -R
```

`Reset device completed!` means the keyboard is back. `Not found device!` means step 1 was skipped.
The same steps are in the **Device** tab.

## Run it

Requires Node 20+.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build in dist/
npm test
```

`dist/` is a static bundle: GitHub Pages, Netlify, or a local folder all work. The build uses
relative asset paths, so it runs from any subdirectory.

Pushing to `main` runs `.github/workflows/pages.yml`: it tests, builds, and publishes `dist/` to
GitHub Pages. Enable it once under **Settings → Pages → Source: GitHub Actions**.

First connection uses the browser's device picker. Chromium remembers the permission, and the app
reconnects automatically on the next visit. Open the page in a normal browser tab: embedded preview
panes (IDE webviews, in-app browsers) often block the WebHID device picker, so nothing appears when
you press Connect.

### Connecting over 2.4G

The 2.4G receiver sleeps when the keyboard is idle, and that includes the very first handshake. If
**Connect** ends with “No handshake from the keyboard”, the keyboard was still asleep:

1. Press any key on the keyboard to wake the link.
2. Press **Connect** again while it is awake.

The picker lists the dongle as `87C 2.4G dongle` and the cable as `87C`. Wired USB answers
immediately, so this step is only needed on the receiver.

## Browser support

WebHID exists in Chrome, Edge and Opera on desktop. Firefox and Safari can open the page and use
the key tester, but cannot reach the lighting controls. Demo mode is available everywhere.

## How it was verified

- Device: `VID 342D / PID E406`, product strings `87C` (wired) and `87C 2.4G dongle`.
- Vendor collection: usage page `0xFF60`, usage `0x61`, 32-byte reports with report ID 0.
- A read-only channel scan answered on exactly two channels: **3** (key backlight) and **2** (side
  panel strip). Channels 0, 1, 4 and 5 timed out or stayed silent, so they are never contacted.
- The firmware answers **one step below** the value that was written for brightness (send `100`,
  read `99`). This app treats the readback as confirmation and shows the real value in **Device**.
- The 2.4G receiver sleeps when idle, so a request — including the first handshake after **Connect** —
  can time out. Press any key on the keyboard and retry; the app explains this instead of failing
  silently.

Effect names, ids and channel layout come from the community VIA definition
[`trananhmanh89/weikav-wk87-via-json`](https://github.com/trananhmanh89/weikav-wk87-via-json).

## Desktop companion (Windows)

A browser cannot remap keys at the OS level, so the repository also ships **WK87 Remap**: a
small tray app compiled with the C# compiler that is already on Windows. No installer, no admin
rights, no runtime downloads.

- **Win Rescue** — `Caps Lock` → `Win`, so the Windows key comes back even when the hardware
  `Fn` + `Win` lock is on.
- **Per-key remaps** — any key to any key, or to `Disable`.
- **Game Mode** — blocks the Windows keys, toggled with `Ctrl+Alt+G`.
- **Panic key** — hold the physical `Esc` for 3 seconds and every remap switches off.

Honest limits: an unelevated hook does not reach windows running as administrator, and games that
read Raw Input directly can ignore it. Build and usage notes are in
[`desktop/README.md`](desktop/README.md).

## Disclaimer

Not affiliated with Weikav. Use at your own risk. The command allowlist exists because this
hardware was probed the hard way; if you extend the protocol layer, verify commands on real
hardware before shipping them, and never send `0x0B` automatically.

MIT licensed. See [LICENSE](LICENSE).
