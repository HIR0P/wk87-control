export type Transport = 'usb' | '2.4g' | 'demo'

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'reading'
  | 'applying'
  | 'error'

/** Lighting is stored on the keyboard as HSV bytes, exactly as the firmware exposes it. */
export interface Lighting {
  /** 0-255 */
  brightness: number
  /** Effect id, 0-45 */
  effect: number
  /** 0-255, ignored by effects that do not animate */
  speed: number
  /** 0-255 */
  hue: number
  /** 0-255 */
  saturation: number
  /** 0-255 */
  value: number
}

export interface ZoneLighting {
  keys: Lighting
  side: Lighting
}

export interface DeviceDescriptor {
  productName: string
  vendorId: number
  productId: number
  transport: Transport
  protocolVersion: number
  /** Number of top-level HID collections exposed by the vendor interface */
  collections: number
}

export const DEFAULT_LIGHTING: Lighting = {
  brightness: 127,
  effect: 13,
  speed: 64,
  hue: 0,
  saturation: 255,
  value: 255,
}

export const DEFAULT_SIDE_LIGHTING: Lighting = {
  brightness: 180,
  effect: 14,
  speed: 64,
  hue: 85,
  saturation: 255,
  value: 255,
}

export const DEFAULT_ZONE_LIGHTING: ZoneLighting = {
  keys: { ...DEFAULT_LIGHTING },
  side: { ...DEFAULT_SIDE_LIGHTING },
}
