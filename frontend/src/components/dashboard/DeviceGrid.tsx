'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual'
import type { LiveDeviceData } from '@/types'
import { getFleetBucket } from '@/lib/deviceMetrics'
import DeviceCard from './DeviceCard'

interface Props {
  devices: LiveDeviceData[]
}

export default function DeviceGrid ({ devices }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(3)

  useEffect(() => {
    function updateCols () {
      if (window.innerWidth < 768) setCols(1)
      else if (window.innerWidth < 1280) setCols(2)
      else setCols(3)
    }

    updateCols()
    window.addEventListener('resize', updateCols)

    return () => window.removeEventListener('resize', updateCols)
  }, [])

  const sorted = useMemo(
    () => [...devices].sort((a, b) => {
      const bucketPriority = { irrigating: 0, online: 1, stale: 2, offline: 3 }
      const aBucket = getFleetBucket(a)
      const bBucket = getFleetBucket(b)

      if (aBucket !== bBucket) return bucketPriority[aBucket] - bucketPriority[bBucket]

      return a.device_id.localeCompare(b.device_id)
    }),
    [devices]
  )

  const rows = useMemo(() => {
    const r: LiveDeviceData[][] = []
    for (let i = 0; i < sorted.length; i += cols) {
      r.push(sorted.slice(i, i + cols))
    }
    return r
  }, [cols, sorted])

  const estimatedCardHeight = cols === 1 ? 192 : cols === 2 ? 176 : 168

  const virtualizer = useVirtualizer({
    count:          rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize:   () => estimatedCardHeight,
    overscan:       5,
  })

  if (devices.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-900 rounded-xl border border-gray-800 text-gray-500">
        Waiting for device data…
      </div>
    )
  }

  return (
    <div ref={parentRef} className="min-h-[28rem] max-h-[calc(100vh-420px)] overflow-y-auto rounded-3xl border border-white/10 bg-slate-950/55 p-4 shadow-[0_20px_60px_-32px_rgba(15,23,42,0.85)] backdrop-blur-sm">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vRow: VirtualItem) => (
          <div
            key={vRow.key}
            data-index={vRow.index}
            ref={virtualizer.measureElement}
            style={{ position: 'absolute', top: vRow.start, left: 0, right: 0 }}
            className="pb-3"
          >
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {rows[vRow.index]?.map((device) => (
                <DeviceCard key={device.device_id} device={device} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
