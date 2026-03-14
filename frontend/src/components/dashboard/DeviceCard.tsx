import React from 'react'
import Link  from 'next/link'
import type { LiveDeviceData } from '@/types'
import { formatLastSeen, getFleetBucket } from '@/lib/deviceMetrics'

interface Props {
  device: LiveDeviceData
}

function DeviceCardInner ({ device }: Props) {
  const { device_id, weight, irrigation_status, online, last_seen } = device
  const bucket = getFleetBucket(device)

  const styles =
    bucket === 'irrigating'
      ? {
          border: 'border-sky-400/30',
          ring: 'from-sky-400/20 via-sky-400/5 to-transparent',
          badge: 'border-sky-400/30 bg-sky-400/15 text-sky-200',
          dot: 'bg-sky-400',
          label: 'Irrigating',
        }
      : bucket === 'stale'
        ? {
            border: 'border-amber-400/30',
            ring: 'from-amber-400/20 via-amber-400/5 to-transparent',
            badge: 'border-amber-400/30 bg-amber-400/15 text-amber-200',
            dot: 'bg-amber-400',
            label: 'Stale feed',
          }
        : bucket === 'offline'
          ? {
              border: 'border-slate-600/50',
              ring: 'from-slate-500/15 via-slate-500/5 to-transparent',
              badge: 'border-slate-500/30 bg-slate-500/15 text-slate-200',
              dot: 'bg-slate-500',
              label: 'Offline',
            }
          : {
              border: 'border-emerald-400/30',
              ring: 'from-emerald-400/20 via-emerald-400/5 to-transparent',
              badge: 'border-emerald-400/30 bg-emerald-400/15 text-emerald-200',
              dot: 'bg-emerald-400',
              label: 'Live',
            }

  const ago = formatLastSeen(last_seen)

  return (
    <Link href={`/devices/${encodeURIComponent(device_id)}`}>
      <div className={`relative h-full min-h-[152px] overflow-hidden rounded-2xl border ${styles.border} bg-slate-950/80 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-slate-900/90`}>
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${styles.ring}`} />

        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-sm font-semibold text-white">{device_id}</p>
            <p className="mt-1 text-xs text-slate-400">Realtime weight channel</p>
          </div>
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${online ? styles.dot : 'bg-slate-600'}`} />
        </div>

        <div className="relative mt-5 flex items-end justify-between gap-3">
          <p className="text-3xl font-semibold tracking-tight text-white">
            {weight != null ? weight.toFixed(2) : '--'}
            <span className="ml-1 text-sm font-normal text-slate-400">g</span>
          </p>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${styles.badge}`}>
            {styles.label}
          </span>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-3 text-xs text-slate-400">
          <div>
            <p className="uppercase tracking-[0.18em] text-slate-500">Irrigation</p>
            <p className={`mt-1 font-semibold ${irrigation_status === 'ON' ? 'text-sky-300' : 'text-slate-200'}`}>
              {irrigation_status}
            </p>
          </div>
          <div>
            <p className="uppercase tracking-[0.18em] text-slate-500">Last packet</p>
            <p className="mt-1 truncate font-medium text-slate-200">{ago}</p>
          </div>
        </div>
      </div>
    </Link>
  )
}

// Memoize: only re-render when device data actually changes
const DeviceCard = React.memo(DeviceCardInner, (prev, next) =>
  prev.device.weight            === next.device.weight &&
  prev.device.irrigation_status === next.device.irrigation_status &&
  prev.device.online            === next.device.online &&
  prev.device.last_seen         === next.device.last_seen
)

DeviceCard.displayName = 'DeviceCard'

export default DeviceCard
