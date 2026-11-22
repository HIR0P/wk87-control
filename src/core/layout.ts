/**
 * Physical key geometry for the WK87, taken from the VIA definition's KLE
 * layout (6 rows x 17 columns). Each physical key also carries its standard
 * ANSI TKL KeyboardEvent.code and short legend for the preview and key tester.
 */
export interface StageKeyItem {
  kind: 'key'
  w: number
  label: string
  /** Standard KeyboardEvent.code; null for firmware-only keys like Fn. */
  code: string | null
  hardwareOnly?: boolean
}

export interface StageGapItem {
  kind: 'gap'
  w: number
}

export type StageRowItem = StageKeyItem | StageGapItem

export interface StageRow {
  y: number
  items: StageRowItem[]
}

export interface BoardKey {
  index: number
  x: number
  y: number
  w: number
  label: string
  code: string | null
  hardwareOnly: boolean
}

const k = (label: string, code: string | null, w = 1, hardwareOnly = false): StageKeyItem => ({
  kind: 'key',
  w,
  label,
  code,
  ...(hardwareOnly ? { hardwareOnly: true } : {}),
})

const gap = (w: number): StageGapItem => ({ kind: 'gap', w })

function row(y: number, items: StageRowItem[]): StageRow {
  return { y, items }
}

export const BOARD_UNITS = { width: 18.5, height: 6.25 }

export const BOARD_ROWS: ReadonlyArray<StageRow> = [
  row(0.25, [
    k('Esc', 'Escape'),
    gap(0.25),
    k('F1', 'F1'),
    k('F2', 'F2'),
    k('F3', 'F3'),
    k('F4', 'F4'),
    gap(0.25),
    k('F5', 'F5'),
    k('F6', 'F6'),
    k('F7', 'F7'),
    k('F8', 'F8'),
    gap(0.25),
    k('F9', 'F9'),
    k('F10', 'F10'),
    k('F11', 'F11'),
    k('F12', 'F12'),
    // The VIA definition has one extra matrix slot here (0,16) that no key
    // occupies on the 87-key board; keep the gap so the clusters still line up.
    gap(1.75),
    k('Prt', 'PrintScreen'),
    k('Scr', 'ScrollLock'),
    k('Pau', 'Pause'),
  ]),
  row(1.25, [
    k('`', 'Backquote'),
    k('1', 'Digit1'),
    k('2', 'Digit2'),
    k('3', 'Digit3'),
    k('4', 'Digit4'),
    k('5', 'Digit5'),
    k('6', 'Digit6'),
    k('7', 'Digit7'),
    k('8', 'Digit8'),
    k('9', 'Digit9'),
    k('0', 'Digit0'),
    k('-', 'Minus'),
    k('=', 'Equal'),
    k('Bksp', 'Backspace', 2),
    gap(0.5),
    k('Ins', 'Insert'),
    k('Hom', 'Home'),
    k('PgU', 'PageUp'),
  ]),
  row(2.25, [
    k('Tab', 'Tab', 1.5),
    k('Q', 'KeyQ'),
    k('W', 'KeyW'),
    k('E', 'KeyE'),
    k('R', 'KeyR'),
    k('T', 'KeyT'),
    k('Y', 'KeyY'),
    k('U', 'KeyU'),
    k('I', 'KeyI'),
    k('O', 'KeyO'),
    k('P', 'KeyP'),
    k('[', 'BracketLeft'),
    k(']', 'BracketRight'),
    k('\\', 'Backslash', 1.5),
    gap(0.5),
    k('Del', 'Delete'),
    k('End', 'End'),
    k('PgD', 'PageDown'),
  ]),
  row(3.25, [
    k('Caps', 'CapsLock', 1.75),
    k('A', 'KeyA'),
    k('S', 'KeyS'),
    k('D', 'KeyD'),
    k('F', 'KeyF'),
    k('G', 'KeyG'),
    k('H', 'KeyH'),
    k('J', 'KeyJ'),
    k('K', 'KeyK'),
    k('L', 'KeyL'),
    k(';', 'Semicolon'),
    k("'", 'Quote'),
    k('Enter', 'Enter', 2.25),
  ]),
  row(4.25, [
    k('Shift', 'ShiftLeft', 2.25),
    k('Z', 'KeyZ'),
    k('X', 'KeyX'),
    k('C', 'KeyC'),
    k('V', 'KeyV'),
    k('B', 'KeyB'),
    k('N', 'KeyN'),
    k('M', 'KeyM'),
    k(',', 'Comma'),
    k('.', 'Period'),
    k('/', 'Slash'),
    k('Shift', 'ShiftRight', 2.75),
    gap(1.5),
    k('↑', 'ArrowUp'),
  ]),
  row(5.25, [
    k('Ctrl', 'ControlLeft', 1.25),
    k('Win', 'MetaLeft', 1.25),
    k('Alt', 'AltLeft', 1.25),
    k('Space', 'Space', 6.25),
    k('Alt', 'AltRight', 1.25),
    k('Fn', null, 1.25, true),
    k('Menu', 'ContextMenu', 1.25),
    k('Ctrl', 'ControlRight', 1.25),
    gap(0.5),
    k('←', 'ArrowLeft'),
    k('↓', 'ArrowDown'),
    k('→', 'ArrowRight'),
  ]),
]

export const BOARD_KEYS: ReadonlyArray<BoardKey> = (() => {
  const keys: BoardKey[] = []
  let index = 0
  for (const r of BOARD_ROWS) {
    let x = 0
    for (const item of r.items) {
      if (item.kind === 'gap') {
        x += item.w
        continue
      }
      keys.push({
        index,
        x,
        y: r.y,
        w: item.w,
        label: item.label,
        code: item.code,
        hardwareOnly: Boolean(item.hardwareOnly),
      })
      index += 1
      x += item.w
    }
  }
  return keys
})()

export const KEY_COUNT = BOARD_KEYS.length
export const TESTABLE_KEY_COUNT = BOARD_KEYS.filter((item) => !item.hardwareOnly && item.code !== null).length
export const TESTABLE_CODES: ReadonlySet<string> = new Set(
  BOARD_KEYS.filter((item) => !item.hardwareOnly && item.code !== null).map((item) => item.code as string),
)
