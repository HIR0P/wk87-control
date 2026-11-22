import { DEFAULT_LIGHTING, DEFAULT_SIDE_LIGHTING, type DeviceDescriptor, type Lighting, type ZoneLighting } from './types'
import type { LightingClient, LightingTarget, LightingZone } from './protocol'

const wait = (ms: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms))

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

  private state: ZoneLighting = {
    keys: { ...DEFAULT_LIGHTING },
    side: { ...DEFAULT_SIDE_LIGHTING },
  }

  private readZone(zone: LightingZone): Lighting {
    const state = this.state[zone]
    return { ...state, brightness: Math.max(0, state.brightness - 1) }
  }

  async readLighting(target: LightingTarget = 'keys'): Promise<Lighting> {
    await wait(30)
    const zone: LightingZone = target === 'both' ? 'keys' : target
    return this.readZone(zone)
  }

  async readAllZones(): Promise<ZoneLighting> {
    await wait(45)
    return {
      keys: this.readZone('keys'),
      side: this.readZone('side'),
    }
  }

  async writeLighting(target: LightingTarget, patch: Partial<Lighting>): Promise<void> {
    await wait(45)
    const zones: LightingZone[] = target === 'both' ? ['keys', 'side'] : [target]
    for (const zone of zones) {
      this.state[zone] = { ...this.state[zone], ...patch }
    }
  }

  async ping(): Promise<number> {
    const simulated = 12
    await wait(simulated)
    return simulated
  }

  async close(): Promise<void> {
    await wait(0)
  }
}
