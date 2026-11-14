import { DEFAULT_LIGHTING, type DeviceDescriptor, type Lighting } from './types'
import type { LightingClient, LightingTarget, LightingZone } from './protocol'

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/**
 * In-memory stand-in so the whole interface can be explored without hardware.
 * It deliberately reproduces the firmware's off-by-one readback on brightness
 * (set 100, read 99) and starts the two lighting zones on different values, so
 * the zone switch is visibly doing something.
 */
export class DemoClient implements LightingClient {
  readonly kind = 'demo' as const
  readonly descriptor: DeviceDescriptor = {
    productName: 'WK87 (demo)',
    vendorId: 0x342d,
    productId: 0xe406,
    transport: 'demo',
    protocolVersion: 0x000c,
    collections: 2,
  }

  private state: Record<LightingZone, Lighting> = {
    keys: { ...DEFAULT_LIGHTING },
    side: { brightness: 255, effect: 14, speed: 64, hue: 85, saturation: 255, value: 255 },
  }

  async readLighting(target: LightingTarget = 'keys'): Promise<Lighting> {
    await wait(30)
    const zone: LightingZone = target === 'both' ? 'keys' : target
    const state = this.state[zone]
    return { ...state, brightness: Math.max(0, state.brightness - 1) }
  }

  async writeLighting(target: LightingTarget, patch: Partial<Lighting>): Promise<void> {
    await wait(45)
    const zones: LightingZone[] = target === 'both' ? ['keys', 'side'] : [target]
    for (const zone of zones) {
      this.state[zone] = { ...this.state[zone], ...patch }
    }
  }

  async close(): Promise<void> {
    await wait(0)
  }
}
