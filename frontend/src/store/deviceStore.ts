import { create } from 'zustand'
import type { LiveDeviceData, DeviceEvent } from '@/types'

interface DeviceStoreState {
  /** Latest live snapshot for every device – keyed by device_id */
  devices: Record<string, LiveDeviceData>
  /** Last N events received via WebSocket */
  recentEvents: DeviceEvent[]

  updateBatch:   (batch: LiveDeviceData[]) => void
  addEvent:      (event: DeviceEvent)      => void
  clearDevices:  ()                        => void
}

export const useDeviceStore = create<DeviceStoreState>((set) => ({
  devices:      {},
  recentEvents: [],

  updateBatch: (batch) =>
    set((s) => ({ devices: { ...s.devices, ...Object.fromEntries(batch.map((d) => [d.device_id, d])) } })),

  addEvent: (event) =>
    set((s) => ({ recentEvents: [event, ...s.recentEvents].slice(0, 200) })),

  clearDevices: () => set({ devices: {}, recentEvents: [] }),
}))
