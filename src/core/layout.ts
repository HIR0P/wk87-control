/**
 * Physical key geometry for the WK87, taken from the VIA definition's KLE
 * layout (6 rows x 17 columns). Only widths and gaps are kept: the app never
 * draws legends, so no key name has to be guessed.
 */
export interface StageItem {
  w?: number
  gap?: number
}

export interface StageRow {
  y: number
  items: Array<{ kind: 'key'; w: number } | { kind: 'gap'; w: number }>
}

const key = (w = 1): StageItem => ({ w })
const gap = (w: number): StageItem => ({ gap: w })

function row(y: number, items: StageItem[]): StageRow {
  return {
    y,
    items: items.map((i) =>
      i.gap === undefined ? { kind: 'key', w: i.w ?? 1 } : { kind: 'gap', w: i.gap },
    ),
  }
}

const ones = (n: number) => Array.from({ length: n }, () => key())

export const BOARD_UNITS = { width: 18.5, height: 6.25 }

export const BOARD_ROWS: ReadonlyArray<StageRow> = [
  row(0.25, [
    key(),
    gap(0.25),
    ...ones(4),
    gap(0.25),
    ...ones(4),
    gap(0.25),
    ...ones(4),
    // The VIA definition has one extra matrix slot here (0,16) that no key
    // occupies on the 87-key board; keep the gap so the clusters still line up.
    gap(1.75),
    ...ones(3),
  ]),
  row(1.25, [key(), ...ones(12), key(2), gap(0.5), ...ones(3)]),
  row(2.25, [key(1.5), ...ones(12), key(1.5), gap(0.5), ...ones(3)]),
  row(3.25, [key(1.75), ...ones(11), key(2.25)]),
  row(4.25, [key(2.25), ...ones(10), key(2.75), gap(1.5), key()]),
  row(5.25, [
    key(1.25),
    key(1.25),
    key(1.25),
    key(6.25),
    key(1.25),
    key(1.25),
    key(1.25),
    key(1.25),
    gap(0.5),
    ...ones(3),
  ]),
]

export const KEY_COUNT = BOARD_ROWS.reduce(
  (total, r) => total + r.items.filter((i) => i.kind === 'key').length,
  0,
)
