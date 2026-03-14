import type { LiveDeviceData } from '@/types'
import { formatLastSeen, summarizeFleet } from '@/lib/deviceMetrics'

interface Props {
  devices: LiveDeviceData[]
}

export default function StatsBar ({ devices }: Props) {
  const summary = summarizeFleet(devices)

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard
        label="Fleet size"
        value={String(summary.total)}
        accent="border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
        note={summary.total === 1 ? '1 registered device' : `${summary.total} registered devices`}
      />
      <StatCard
        label="Online now"
        value={String(summary.online)}
        accent="border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
        note={summary.newestSeenAt ? `Latest packet ${formatLastSeen(summary.newestSeenAt)}` : 'No live packets yet'}
      />
      <StatCard
        label="Offline"
        value={String(summary.offline)}
        accent="border-slate-400/20 bg-slate-400/10 text-slate-200"
        note={summary.offline > 0 ? 'Needs comms check' : 'All connected'}
      />
      <StatCard
        label="Irrigating"
        value={String(summary.irrigating)}
        accent="border-sky-400/20 bg-sky-400/10 text-sky-200"
        note={summary.irrigating > 0 ? 'Active water delivery' : 'No active cycles'}
      />
      <StatCard
        label="Average weight"
        value={summary.averageWeight != null ? `${summary.averageWeight.toFixed(2)} g` : 'No data'}
        accent="border-amber-400/20 bg-amber-400/10 text-amber-200"
        note={summary.stale > 0 ? `${summary.stale} stale live feed${summary.stale === 1 ? '' : 's'}` : 'Fresh live feed'}
      />
    </div>
  )
}

function StatCard ({
  label,
  value,
  note,
  accent,
}: {
  label: string
  value: string
  note: string
  accent: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.85)] backdrop-blur-sm">
      <div className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${accent}`}>
        {label}
      </div>
      <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{note}</p>
    </div>
  )
}
