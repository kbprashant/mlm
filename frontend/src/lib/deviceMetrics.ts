import { formatDistanceToNow } from 'date-fns'
import type { DataPoint, LiveDeviceData } from '@/types'

export type FleetBucket = 'irrigating' | 'online' | 'stale' | 'offline'

const STALE_AFTER_MS = 30_000

export function formatLastSeen(lastSeen?: string | null) {
  if (!lastSeen) return 'Never reported'

  const parsed = new Date(lastSeen)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'

  return formatDistanceToNow(parsed, { addSuffix: true })
}

export function getFleetBucket(device: LiveDeviceData): FleetBucket {
  if (!device.online) return 'offline'
  if (device.irrigation_status === 'ON') return 'irrigating'

  const lastSeenMs = device.last_seen ? new Date(device.last_seen).getTime() : 0
  if (!lastSeenMs || Date.now() - lastSeenMs > STALE_AFTER_MS) return 'stale'

  return 'online'
}

export function summarizeFleet(devices: LiveDeviceData[]) {
  let online = 0
  let offline = 0
  let irrigating = 0
  let stale = 0
  let totalWeight = 0
  let weightedDevices = 0
  let newestSeenAt = 0

  for (const device of devices) {
    const bucket = getFleetBucket(device)

    if (bucket === 'offline') offline += 1
    else online += 1

    if (bucket === 'irrigating') irrigating += 1
    if (bucket === 'stale') stale += 1

    if (Number.isFinite(device.weight)) {
      totalWeight += device.weight
      weightedDevices += 1
    }

    const seenAt = device.last_seen ? new Date(device.last_seen).getTime() : 0
    if (seenAt > newestSeenAt) newestSeenAt = seenAt
  }

  return {
    total: devices.length,
    online,
    offline,
    irrigating,
    stale,
    averageWeight: weightedDevices > 0 ? totalWeight / weightedDevices : null,
    newestSeenAt: newestSeenAt ? new Date(newestSeenAt).toISOString() : null,
  }
}

export interface HistorySummary {
  sampleCount: number
  currentWeight: number | null
  startWeight: number | null
  minWeight: number | null
  maxWeight: number | null
  averageWeight: number | null
  delta: number | null
  dropFromPeak: number | null
  irrigationStarts: number
  irrigationSamples: number
  volatility: number | null
  lastTimestamp: string | null
}

export function summarizeHistory(points: DataPoint[]): HistorySummary {
  if (points.length === 0) {
    return {
      sampleCount: 0,
      currentWeight: null,
      startWeight: null,
      minWeight: null,
      maxWeight: null,
      averageWeight: null,
      delta: null,
      dropFromPeak: null,
      irrigationStarts: 0,
      irrigationSamples: 0,
      volatility: null,
      lastTimestamp: null,
    }
  }

  const weights = points
    .map((point) => point.weight)
    .filter((weight) => Number.isFinite(weight))

  const currentWeight = weights.length > 0 ? weights[weights.length - 1] : null
  const startWeight = weights.length > 0 ? weights[0] : null
  const minWeight = weights.length > 0 ? Math.min(...weights) : null
  const maxWeight = weights.length > 0 ? Math.max(...weights) : null
  const averageWeight = weights.length > 0
    ? weights.reduce((sum, weight) => sum + weight, 0) / weights.length
    : null

  let irrigationStarts = 0
  let irrigationSamples = 0
  let volatilityAccumulator = 0
  let volatilitySamples = 0

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (point.irrigation_status === 'ON') irrigationSamples += 1

    if (index > 0) {
      const previous = points[index - 1]
      if (point.irrigation_status === 'ON' && previous.irrigation_status !== 'ON') {
        irrigationStarts += 1
      }

      const delta = point.weight - previous.weight
      if (Number.isFinite(delta)) {
        volatilityAccumulator += Math.abs(delta)
        volatilitySamples += 1
      }
    }
  }

  return {
    sampleCount: points.length,
    currentWeight,
    startWeight,
    minWeight,
    maxWeight,
    averageWeight,
    delta: currentWeight != null && startWeight != null ? currentWeight - startWeight : null,
    dropFromPeak: currentWeight != null && maxWeight != null ? maxWeight - currentWeight : null,
    irrigationStarts,
    irrigationSamples,
    volatility: volatilitySamples > 0 ? volatilityAccumulator / volatilitySamples : null,
    lastTimestamp: points[points.length - 1]?.time ?? null,
  }
}