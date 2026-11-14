import type { DeviceDescriptor, Lighting, Transport } from './types'

export const VENDOR_ID = 0x342d
export const PRODUCT_ID = 0xe406
export const VENDOR_USAGE_PAGE = 0xff60
export const VENDOR_USAGE = 0x61

/** Report ID 0, 32 bytes of payload -> 33 bytes on the wire. */
export const REPORT_ID = 0
export const REPORT_SIZE = 32

/** Per-attempt limit. The 2.4G receiver sleeps and needs a key press to wake. */
export const RESPONSE_TIMEOUT_MS = 1500
const ATTEMPTS = 2

/**
 * The firmware answers on QMK's lighting channels:
 *   3 = per-key RGB matrix (the key backlight)
 *   2 = RGB light strip (the side panel)
 * Channel 1 (monochrome backlight) and 4/5 stay silent on this board.
 */
export const LIGHTING_CHANNELS = {
  keys: 3,
  side: 2,
} as const

export type LightingZone = keyof typeof LIGHTING_CHANNELS
export type LightingTarget = LightingZone | 'both'

export const LIGHTING_CHANNEL = LIGHTING_CHANNELS.keys

/** Which firmware channels a target writes to, in write order. */
export function channelsFor(target: LightingTarget): number[] {
  if (target === 'both') return [LIGHTING_CHANNELS.keys, LIGHTING_CHANNELS.side]
  return [LIGHTING_CHANNELS[target]]
}

export const CMD = {
  GET_PROTOCOL_VERSION: 0x01,
  SET_VALUE: 0x07,
  GET_VALUE: 0x08,
} as const

/**
 * Commands the app is allowed to emit. Everything else is refused in code,
 * not just by convention. See BLOCKED for the ones we know about.
 */
export const SAFE_COMMANDS: ReadonlySet<number> = new Set([
  CMD.GET_PROTOCOL_VERSION,
  CMD.SET_VALUE,
  CMD.GET_VALUE,
])

export const BLOCKED: ReadonlyArray<{ code: number; label: string; reason: string }> = [
  {
    code: 0x0b,
    label: '0x0B',
    reason:
      'On WK87 firmware this jumps to the WB32 bootloader, even though standard VIA uses it for "set keycode". Sending it is what dropped a test keyboard into DFU mode. Never sent by this app.',
  },
  {
    code: 0x09,
    label: '0x09',
    reason: 'VIA "dynamic keymap save". Unverified and pointless here: the firmware reports no dynamic keymap.',
  },
  {
    code: 0x06,
    label: '0x06',
    reason: 'VIA "set keycode" on older protocol revisions. Unverified on this firmware.',
  },
  {
    code: 0x04,
    label: '0x04',
    reason: 'VIA macro buffer write. The firmware reports zero macro slots.',
  },
  {
    code: 0x05,
    label: '0x05',
    reason: 'VIA macro buffer read. The firmware reports zero macro slots.',
  },
]

export type Wk87ErrorKind = 'timeout' | 'blocked' | 'disconnected' | 'device' | 'unsupported'

export class Wk87Error extends Error {
  readonly kind: Wk87ErrorKind

  constructor(kind: Wk87ErrorKind, message: string) {
    super(message)
    this.name = 'Wk87Error'
    this.kind = kind
  }
}

export interface LightingClient {
  readonly kind: 'hid' | 'demo'
  readonly descriptor: DeviceDescriptor
  /** Reads one zone; "both" reads the keys channel because that is the anchor. */
  readLighting(target?: LightingTarget): Promise<Lighting>
  writeLighting(target: LightingTarget, patch: Partial<Lighting>): Promise<void>
  close(): Promise<void>
}

export const LIGHTING_IDS = {
  brightness: 1,
  effect: 2,
  speed: 3,
  color: 4,
} as const

export function supportsWebHid(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator && !!navigator.hid
}

export function transportFromName(productName: string): Transport {
  return /2\.4\s?g/i.test(productName) ? '2.4g' : 'usb'
}

export async function requestKeyboard(): Promise<HIDDevice> {
  if (!supportsWebHid()) {
    throw new Wk87Error(
      'unsupported',
      'This browser cannot talk to HID devices. Chrome, Edge or Opera on desktop is required.',
    )
  }
  const devices = await navigator.hid.requestDevice({
    filters: [
      {
        vendorId: VENDOR_ID,
        productId: PRODUCT_ID,
        usagePage: VENDOR_USAGE_PAGE,
        usage: VENDOR_USAGE,
      },
    ],
  })
  const device = devices[0]
  if (!device) {
    throw new Wk87Error('device', 'No keyboard was selected.')
  }
  return device
}

const toBytes = (view: DataView): Uint8Array<ArrayBuffer> => {
  const copy = new Uint8Array(view.byteLength)
  copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
  return copy
}

/**
 * Response framing differs between WebHID implementations: Chrome omits the
 * report ID from `event.data`, but defensive code should not care. If the first
 * byte equals the report ID, drop it. Command bytes are never 0, so this is
 * unambiguous for the three commands in the allowlist.
 */
function normaliseReport(event: HIDInputReportEvent): Uint8Array<ArrayBuffer> {
  const bytes = toBytes(event.data)
  const start = bytes.length > 1 && bytes[0] === event.reportId ? 1 : 0
  return bytes.slice(start)
}

/**
 * The allowlist gate. Every outgoing command goes through this, which makes
 * "never send 0x0B" a property of the code rather than a comment.
 */
export function assertAllowed(command: number): void {
  if (!SAFE_COMMANDS.has(command)) {
    throw new Wk87Error(
      'blocked',
      `Command 0x${command.toString(16).toUpperCase().padStart(2, '0')} is not on the verified allowlist.`,
    )
  }
}

/** Build the 32-byte payload for report ID 0. */
export function encodeCommand(command: number, params: number[] = []): Uint8Array<ArrayBuffer> {
  assertAllowed(command)
  const payload = new Uint8Array(REPORT_SIZE)
  payload[0] = command
  params.forEach((value, index) => {
    payload[index + 1] = value & 0xff
  })
  return payload
}

export class Wk87Client implements LightingClient {
  readonly kind = 'hid' as const
  readonly descriptor: DeviceDescriptor
  private readonly device: HIDDevice
  private waiter: {
    command: number
    resolve: (value: Uint8Array<ArrayBuffer>) => void
    reject: (error: Error) => void
    timer: number
  } | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private closed = false

  private constructor(device: HIDDevice, descriptor: DeviceDescriptor) {
    this.device = device
    this.descriptor = descriptor
  }

  static async open(device: HIDDevice): Promise<Wk87Client> {
    if (!device.opened) {
      await device.open()
    }
    let protocolVersion: number
    try {
      protocolVersion = await rawProtocolVersion(device)
    } catch (error) {
      await device.close().catch(() => undefined)
      throw error
    }
    const client = new Wk87Client(device, {
      productName: device.productName || 'WK87',
      vendorId: device.vendorId,
      productId: device.productId,
      transport: transportFromName(device.productName || ''),
      protocolVersion,
      collections: device.collections?.length ?? 0,
    })
    device.addEventListener('inputreport', client.handleReport)
    return client
  }

  private handleReport = (event: HIDInputReportEvent): void => {
    const waiter = this.waiter
    if (!waiter) return
    const data = normaliseReport(event)
    if (data[0] !== waiter.command) return
    this.clearWaiter()
    waiter.resolve(data)
  }

  private clearWaiter = (): void => {
    if (!this.waiter) return
    window.clearTimeout(this.waiter.timer)
    this.waiter = null
  }

  private waitFor(command: number): Promise<Uint8Array<ArrayBuffer>> {
    return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.waiter = null
        reject(
          new Wk87Error(
            'timeout',
            'The keyboard did not answer. On 2.4G it falls asleep: press any key on it, then try again.',
          ),
        )
      }, RESPONSE_TIMEOUT_MS)
      this.waiter = { command, resolve, reject, timer }
    })
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task)
    this.queue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  private async command(command: number, params: number[] = []): Promise<Uint8Array> {
    if (this.closed) {
      throw new Wk87Error('disconnected', 'The keyboard is no longer connected.')
    }

    const payload = encodeCommand(command, params)

    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      const waiter = this.waitFor(command)
      try {
        await this.device.sendReport(REPORT_ID, payload)
      } catch (error) {
        this.clearWaiter()
        throw new Wk87Error(
          'disconnected',
          error instanceof Error ? error.message : 'Writing to the keyboard failed.',
        )
      }
      try {
        return await waiter
      } catch (error) {
        if (attempt === ATTEMPTS) throw error
      }
    }
    throw new Wk87Error('timeout', 'The keyboard did not answer.')
  }

  private async getValue(channel: number, id: number): Promise<number[]> {
    const data = await this.command(CMD.GET_VALUE, [channel, id])
    return Array.from(data.slice(3))
  }

  private async setValue(channel: number, id: number, bytes: number[]): Promise<void> {
    await this.command(CMD.SET_VALUE, [channel, id, ...bytes])
  }

  private async readChannel(channel: number): Promise<Lighting> {
    const brightness = await this.getValue(channel, LIGHTING_IDS.brightness)
    const effect = await this.getValue(channel, LIGHTING_IDS.effect)
    const speed = await this.getValue(channel, LIGHTING_IDS.speed)
    const color = await this.getValue(channel, LIGHTING_IDS.color)
    return {
      brightness: brightness[0] ?? 0,
      effect: effect[0] ?? 0,
      speed: speed[0] ?? 0,
      hue: color[0] ?? 0,
      saturation: color[1] ?? 0,
      value: color[2] ?? 0,
    }
  }

  private async writeChannel(channel: number, patch: Partial<Lighting>): Promise<void> {
    if (patch.brightness !== undefined) {
      await this.setValue(channel, LIGHTING_IDS.brightness, [patch.brightness])
    }
    if (patch.effect !== undefined) {
      await this.setValue(channel, LIGHTING_IDS.effect, [patch.effect])
    }
    if (patch.speed !== undefined) {
      await this.setValue(channel, LIGHTING_IDS.speed, [patch.speed])
    }
    if (patch.hue !== undefined || patch.saturation !== undefined || patch.value !== undefined) {
      const current = await this.getValue(channel, LIGHTING_IDS.color)
      await this.setValue(channel, LIGHTING_IDS.color, [
        patch.hue ?? current[0] ?? 0,
        patch.saturation ?? current[1] ?? 0,
        patch.value ?? current[2] ?? 0,
      ])
    }
  }

  readLighting = (target: LightingTarget = 'keys'): Promise<Lighting> =>
    this.enqueue(() => this.readChannel(channelsFor(target)[0]))

  writeLighting = (target: LightingTarget, patch: Partial<Lighting>): Promise<void> =>
    this.enqueue(async () => {
      for (const channel of channelsFor(target)) {
        await this.writeChannel(channel, patch)
      }
    })

  close = async (): Promise<void> => {
    this.closed = true
    this.clearWaiter()
    this.device.removeEventListener('inputreport', this.handleReport)
    if (this.device.opened) {
      await this.device.close().catch(() => undefined)
    }
  }
}

async function rawProtocolVersion(device: HIDDevice): Promise<number> {
  const payload = new Uint8Array(REPORT_SIZE)
  payload[0] = CMD.GET_PROTOCOL_VERSION

  const response = await new Promise<Uint8Array>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      device.removeEventListener('inputreport', onReport)
      reject(new Wk87Error('timeout', 'No handshake from the keyboard. Is it switched to wired or 2.4G?'))
    }, RESPONSE_TIMEOUT_MS)
    const onReport = (event: HIDInputReportEvent) => {
      const data = normaliseReport(event)
      if (data[0] !== CMD.GET_PROTOCOL_VERSION) return
      window.clearTimeout(timer)
      device.removeEventListener('inputreport', onReport)
      resolve(data)
    }
    device.addEventListener('inputreport', onReport)
    device.sendReport(REPORT_ID, payload).catch((error: unknown) => {
      window.clearTimeout(timer)
      device.removeEventListener('inputreport', onReport)
      reject(error instanceof Error ? error : new Error('Handshake failed.'))
    })
  })

  return ((response[1] ?? 0) << 8) | (response[2] ?? 0)
}

/** Screen-reader friendly summary of an unknown thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof Wk87Error) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}
