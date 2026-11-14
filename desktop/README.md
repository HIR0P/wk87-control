# WK87 Remap (Windows companion)

The one thing a browser cannot do for the WK87: remap keys **below** the browser, in
Windows itself. It runs in the notification area, survives reboots if you ask it to, and works
in every app — including full-screen games that never load a web page.

This is not a firmware keymap editor. It cannot change what the keyboard reports; it changes
what Windows does with those reports. That is the honest capability, and it is enough for the
usual WK87 problems:

| Problem | What this does |
| --- | --- |
| The hardware `Fn` + `Win` lock is stuck on | `Caps Lock` → `Windows key`, so the Win key returns without firmware |
| A key is in the wrong place for your hands | Any key → any other key |
| A key is worse than nothing | Any key → `Disable` |
| Games keep opening the Start menu | Game Mode blocks the Windows keys, toggle with `Ctrl+Alt+G` |
| A bad remap locked you out | Hold the **physical** Esc key for 3 seconds to pause everything |

## Requirements

- Windows 7 or newer.
- .NET Framework 4.x, which ships with Windows 10 and 11.
- No installer, no runtime download, no admin rights. The exe is compiled with the C# compiler
  that is already on the machine.

## Build

```powershell
powershell -ExecutionPolicy Bypass -File desktop\build.ps1
```

The script finds `csc.exe` in the .NET Framework folder, compiles everything in `desktop\src`,
writes `desktop\bin\WK87Remap.exe`, then runs the built-in self-test (name parsing, map
building, config round-trip) and fails loudly if a check does not pass.

To compile by hand:

```powershell
& "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /target:winexe /out:WK87Remap.exe `
  /win32manifest:desktop\src\app.manifest `
  /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Runtime.Serialization.dll `
  desktop\src\*.cs
```

## Run

Double-click `WK87Remap.exe`. The window opens, the tray icon appears, and changes take effect
immediately. Closing the window keeps the app in the tray; **Exit** in the tray menu is the real
quit.

The exe is unsigned, so Windows SmartScreen may show "Windows protected your PC" the first time.
That is expected for a hobby build with no code-signing certificate.

### Command line

| Flag | Effect |
| --- | --- |
| *(none)* | normal start; the settings window opens |
| `--tray` | start hidden in the tray (used by autostart) |
| `--config "D:\path"` | keep `config.json` and `log.txt` in that folder instead of `%APPDATA%\WK87 Control`; autostart keeps the flag |
| `--selftest` | run the head-less checks, write `selftest.log` next to the exe, exit 0/1 |

A second launch does not start a second remapper: it asks the running copy to show its window
and exits.

## What each setting does

- **Win Rescue** — remaps `Caps Lock` to the left Windows key. The Caps Lock LED still lights
  up when you tap it, because that LED is wired to the key, not to Windows.
- **Game Mode** — blocks both Windows keys. `Ctrl+Alt+G` toggles it from any app, and the tray
  icon advertises the state.
- **Panic key** — hold the *physical* Esc key for the configured time (1–10 s, default 3 s) and
  every remap switches off. The check runs before any remap is applied, so it still works if Esc
  itself is remapped or disabled.
- **Per-key remaps** — pick a `From` key and a `To` key, or click **Press** and hit the key you
  want. `To` accepts `Disable`. An empty tray is a working tray: zero rules means nothing is
  intercepted.

Rules are stored in `%APPDATA%\WK87 Control\config.json` and are applied the moment you change
them. The tray menu can also pause everything, open the config folder, or start the app with
Windows.

## Config file

```json
{
  "winRescue": true,
  "gameMode": false,
  "panicHoldMs": 3000,
  "remaps": [
    { "from": "CapsLock", "to": "LWin" },
    { "from": "F12", "to": "Disable" }
  ]
}
```

`from` and `to` accept any name from the `System.Windows.Forms.Keys` enum (`CapsLock`, `LWin`,
`PageDown`, `F13`, `D1`…), the friendly names used in the picker (`Caps Lock`, `Win`, `Page Up`,
`Num 3`), hex virtual-key codes (`0x5B`), and `Disable`. A hand-edited file is read on the next
start; invalid rules are skipped and reported in the window instead of breaking the app.

## Limits, stated up front

- **Elevated windows.** Windows blocks a normal process from injecting keys into a window that
  runs as administrator. Remaps work in normal apps and most games, not in Task Manager or an
  admin console. Fixing that needs UIAccess signing or a driver; this app deliberately uses
  neither.
- **Raw Input games.** Some anti-cheat and Raw Input games read the keyboard directly and ignore
  Windows hooks. The rule list says so; there is no lie about universal coverage.
- **Not firmware.** The keyboard keeps reporting the physical keys over USB, so the web app's key
  tester still shows the original key, and the layout on another machine is unchanged.
- **The hardware Win lock.** If `Fn` + `Win` locked the Win key in firmware, no software can
  unlock it. Win Rescue routes around it by remapping Caps Lock instead.
- **Bluetooth.** Unrelated to this app, but the WK87 in Bluetooth mode is outside the browser's
  reach; the remapper does not care which transport you use.

## How it works

A `WH_KEYBOARD_LL` hook sees each key before any application. Mapped keys are swallowed and the
target is sent with `SendInput`; the injected flag is checked so the injected key is never
processed again (no loops). Physical Esc is watched separately for the panic timer. Autostart is
a single `HKCU\...\Run` value pointing at the exe with `--tray`, and it is off unless you tick the
box. Nothing is installed, nothing runs as a service, nothing talks to the network.

## Uninstall

1. Tray menu → **Exit**.
2. Untick **Start with Windows** first, or delete `WK87 Remap` from
   `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
3. Delete `WK87Remap.exe` and, if you want the settings gone, `%APPDATA%\WK87 Control`.

Log lines for the current and previous runs are in `%APPDATA%\WK87 Control\log.txt`.

## Troubleshooting

- **"Windows refused the keyboard hook"** — another remapper owns the low-level hook, or the app
  was launched in a sandbox that blocks hooks. Close the other tool and retry.
- **A remap does not fire in one specific game** — the game reads Raw Input; see the limits.
- **Tray icon missing** — Windows hides new icons by default; check the overflow (`^`) area.
- **Ctrl+Alt+G does nothing** — another app owns the hotkey. The window says so and the checkbox
  still works.
- **Keys feel stuck after a crash** — Windows releases injected keys when the process dies; if a
  key still looks down, press and release it once.

## License

MIT, same as the rest of the project. Not affiliated with Weikav.
