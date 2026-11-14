import { describe, expect, it } from 'vitest'
import { hsvToCss, hsvToHex, hueDegrees } from './colors'
import { EFFECTS, effectById } from './effects'
import { keyLabel, locationName } from './keyLabels'
import { BOARD_ROWS, BOARD_UNITS, KEY_COUNT } from './layout'
import { parsePresets } from './presets'
import { CMD, LIGHTING_CHANNELS, REPORT_SIZE, SAFE_COMMANDS, Wk87Error, assertAllowed, channelsFor, encodeCommand } from './protocol'

describe('command encoding', () => {
  it('pads a command to a full 32-byte report with report ID 0', () => {
    const payload = encodeCommand(CMD.GET_VALUE, [3, 1])
    expect(payload).toHaveLength(REPORT_SIZE)
    expect(Array.from(payload.slice(0, 4))).toEqual([0x08, 0x03, 0x01, 0x00])
    expect(payload[REPORT_SIZE - 1]).toBe(0)
  })

  it('keeps the verified command set small', () => {
    expect([...SAFE_COMMANDS].sort()).toEqual([0x01, 0x07, 0x08])
    expect(() => assertAllowed(CMD.GET_VALUE)).not.toThrow()
  })

  it('refuses the bootloader command and every unverified command', () => {
    for (const command of [0x0b, 0x06, 0x09, 0x04, 0x05, 0x02]) {
      expect(() => assertAllowed(command)).toThrow(Wk87Error)
      expect(() => encodeCommand(command, [0])).toThrow(/allowlist/)
    }
  })
})

describe('lighting zones', () => {
  it('maps the verified channels: 3 for keys, 2 for the side panel', () => {
    expect(LIGHTING_CHANNELS.keys).toBe(3)
    expect(LIGHTING_CHANNELS.side).toBe(2)
  })

  it('writes the key channel first, then the side channel', () => {
    expect(channelsFor('keys')).toEqual([3])
    expect(channelsFor('side')).toEqual([2])
    expect(channelsFor('both')).toEqual([3, 2])
  })

  it('never targets the silent channels', () => {
    const touched = new Set(
      (['keys', 'side', 'both'] as const).flatMap((target) => channelsFor(target)),
    )
    expect([...touched].sort()).toEqual([2, 3])
  })
})

describe('effect metadata', () => {
  it('matches the firmware list of 46 effects, ids in order', () => {
    expect(EFFECTS).toHaveLength(46)
    EFFECTS.forEach((effect, index) => expect(effect.id).toBe(index))
  })

  it('knows which effects ignore speed and color', () => {
    expect(effectById(0).usesSpeed).toBe(false)
    expect(effectById(1).usesSpeed).toBe(true)
    expect(effectById(24).usesColor).toBe(false)
    expect(effectById(29).usesColor).toBe(false)
    expect(effectById(13).usesColor).toBe(true)
    expect(effectById(999)).toBe(EFFECTS[0])
  })
})

describe('colors', () => {
  it('converts the HSV bytes the firmware stores', () => {
    expect(hsvToCss(0, 255, 255)).toBe('rgb(255 0 0)')
    expect(hsvToCss(0, 0, 255)).toBe('rgb(255 255 255)')
    expect(hsvToCss(0, 255, 0)).toBe('rgb(0 0 0)')
    expect(hsvToHex(85, 255, 255)).toBe('#00ff00')
    expect(hueDegrees(255)).toBe(360)
  })
})

describe('board geometry', () => {
  it('fits every row inside the 18.5 x 6.25 unit board', () => {
    for (const row of BOARD_ROWS) {
      const width = row.items.reduce((total, item) => total + item.w, 0)
      expect(width).toBeLessThanOrEqual(BOARD_UNITS.width)
      expect(row.y + 1).toBeLessThanOrEqual(BOARD_UNITS.height + 0.25)
    }
  })

  it('draws all 87 physical keys', () => {
    expect(KEY_COUNT).toBe(87)
  })
})

describe('preset import', () => {
  const valid = {
    presets: [
      {
        name: 'Evening',
        lighting: { brightness: 100, effect: 5, speed: 20, hue: 10, saturation: 200, value: 255 },
      },
    ],
  }

  it('accepts a bare array or an exported payload', () => {
    expect(parsePresets(JSON.stringify(valid))).toHaveLength(1)
    expect(parsePresets(JSON.stringify(valid.presets))).toHaveLength(1)
    expect(parsePresets(JSON.stringify(valid))?.[0].name).toBe('Evening')
  })

  it('rejects unreadable files and entries without lighting', () => {
    expect(parsePresets('not json')).toBeNull()
    expect(parsePresets(JSON.stringify([{ name: 'x' }]))).toBeNull()
    expect(parsePresets(JSON.stringify([]))).toBeNull()
  })

  it('clamps values into the ranges the firmware accepts', () => {
    const [preset] = parsePresets(
      JSON.stringify([{ name: 'hot', lighting: { ...valid.presets[0].lighting, effect: 99, brightness: 999 } }]),
    ) ?? []
    expect(preset.lighting.effect).toBe(45)
    expect(preset.lighting.brightness).toBe(255)
  })
})

describe('key labels', () => {
  it('labels physical codes the way people read them', () => {
    expect(keyLabel('KeyA')).toBe('A')
    expect(keyLabel('Digit1')).toBe('1')
    expect(keyLabel('Escape')).toBe('Esc')
    expect(keyLabel('MetaLeft')).toBe('L Win')
    expect(keyLabel('F5')).toBe('F5')
    expect(locationName(1)).toBe('left')
  })
})
