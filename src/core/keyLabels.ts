const NAMED: Record<string, string> = {
  Escape: 'Esc',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Backspace: 'Backspace',
  Tab: 'Tab',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  CapsLock: 'Caps',
  Semicolon: ';',
  Quote: "'",
  Enter: 'Enter',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
  ContextMenu: 'Menu',
  PrintScreen: 'PrtSc',
  ScrollLock: 'ScrLk',
  Pause: 'Pause',
  Insert: 'Ins',
  Delete: 'Del',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ShiftLeft: 'L Shift',
  ShiftRight: 'R Shift',
  ControlLeft: 'L Ctrl',
  ControlRight: 'R Ctrl',
  AltLeft: 'L Alt',
  AltRight: 'R Alt',
  MetaLeft: 'L Win',
  MetaRight: 'R Win',
  NumLock: 'Num',
  IntlBackslash: 'Intl \\',
}

export function keyLabel(code: string, key?: string): string {
  if (NAMED[code]) return NAMED[code]
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  if (/^Numpad/.test(code)) return code.replace('Numpad', 'Num ')
  if (key && key !== 'Unidentified' && key.length <= 6) return key
  return code || '—'
}

export function locationName(location: number): string {
  switch (location) {
    case 0:
      return 'standard'
    case 1:
      return 'left'
    case 2:
      return 'right'
    case 3:
      return 'numpad'
    default:
      return 'unknown'
  }
}
