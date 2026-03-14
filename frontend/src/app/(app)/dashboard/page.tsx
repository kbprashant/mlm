'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import type { LegacyMlm, LiveDeviceData } from '@/types'
import { api } from '@/lib/api'
import { useDeviceStore } from '@/store/deviceStore'
import StatsBar    from '@/components/dashboard/StatsBar'
import DeviceGrid  from '@/components/dashboard/DeviceGrid'
import { formatLastSeen, getFleetBucket } from '@/lib/deviceMetrics'

const LEGACY_SITES = ['X', 'Y', 'Z'] as const
const LEGACY_STATUS_ORDER = ['disabled', 'ok', 'inactive', 'overweight', 'emptyoverweight', 'underweight'] as const
const LEGACY_STATUS_TONE: Record<(typeof LEGACY_STATUS_ORDER)[number], string> = {
  disabled: 'bg-slate-300 text-slate-900',
  ok: 'bg-lime-500 text-slate-950',
  inactive: 'bg-rose-600 text-white',
  overweight: 'bg-sky-500 text-slate-950',
  emptyoverweight: 'bg-cyan-300 text-slate-950',
  underweight: 'bg-amber-300 text-slate-950',
}

export default function DashboardPage () {
  const [selectedSite, setSelectedSite] = useState<(typeof LEGACY_SITES)[number]>('Y')
  const [legacyMlms, setLegacyMlms] = useState<LegacyMlm[]>([])
  const [legacyLoading, setLegacyLoading] = useState(true)
  const [legacyError, setLegacyError] = useState('')

  const devices = useDeviceStore((s) => s.devices)
  const recentEvents = useDeviceStore((s) => s.recentEvents)
  const list = Object.values(devices)

  useEffect(() => {
    let cancelled = false
    setLegacyLoading(true)
    setLegacyError('')

    api.getLegacyMlms(selectedSite)
      .then((response) => {
        if (!cancelled) setLegacyMlms(response.mlms)
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setLegacyMlms([])
          setLegacyError(error.message)
        }
      })
      .finally(() => {
        if (!cancelled) setLegacyLoading(false)
      })

    return () => { cancelled = true }
  }, [selectedSite])

  const legacySummary = useMemo(() => {
    const summary = new Map<string, LegacyMlm[]>()
    for (const status of LEGACY_STATUS_ORDER) summary.set(status, [])
    for (const mlm of legacyMlms) {
      const bucket = summary.get(mlm.status.bg_color) ?? []
      bucket.push(mlm)
      summary.set(mlm.status.bg_color, bucket)
    }
    return summary
  }, [legacyMlms])

  const legacyLayout = useMemo(() => {
    const columns = Array.from(new Set(legacyMlms.map((mlm) => mlm.column).filter(Boolean))).sort()
    const rows = Array.from(new Set(legacyMlms.map((mlm) => mlm.row).filter((row): row is number => row != null))).sort((a, b) => a - b)
    const map = new Map(legacyMlms.map((mlm) => [`${mlm.column}-${mlm.row}`, mlm]))

    return { columns, rows, map }
  }, [legacyMlms])

  if (legacyMlms.length > 0 || legacyLoading || legacyError) {
    return (
      <div className="space-y-6">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_70px_-35px_rgba(15,23,42,0.95)] backdrop-blur-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">Legacy MLM dashboard</p>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white">Site {selectedSite} overview</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-400">
                  Direct compatibility view for the original Django MLM schema and the legacy Influx fc measurement.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {LEGACY_SITES.map((site) => (
                <button
                  key={site}
                  onClick={() => setSelectedSite(site)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${selectedSite === site ? 'bg-cyan-400/20 text-cyan-200' : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}
                >
                  Site {site}
                </button>
              ))}
            </div>
          </div>
        </section>

        {legacyLoading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center text-slate-400">Loading legacy MLM data…</div>
        ) : legacyError ? (
          <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-10 text-center text-rose-200">{legacyError}</div>
        ) : (
          <>
            <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.9)] backdrop-blur-sm">
              <h2 className="text-lg font-semibold text-white">Summary</h2>
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950/60 text-left text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Count</th>
                      <th className="px-4 py-3">MLMs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LEGACY_STATUS_ORDER.map((status) => {
                      const items = legacySummary.get(status) ?? []
                      return (
                        <tr key={status} className="border-t border-white/10 align-top">
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${LEGACY_STATUS_TONE[status]}`}>
                              {status}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-white">{items.length}</td>
                          <td className="px-4 py-3 text-slate-300">
                            {items.length > 0 ? items.map((mlm) => mlm.id).join(', ') : 'None'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.9)] backdrop-blur-sm">
              <h2 className="text-lg font-semibold text-white">Layout</h2>
              <p className="mt-1 text-sm text-slate-400">Physical MLM grid reconstructed from legacy IDs.</p>
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-2 text-center">
                  <thead>
                    <tr>
                      <th className="px-2 py-2 text-xs uppercase tracking-[0.2em] text-slate-500">Row</th>
                      {legacyLayout.columns.map((column) => (
                        <th key={column} className="px-2 py-2 text-xs uppercase tracking-[0.2em] text-slate-500">{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {legacyLayout.rows.map((row) => (
                      <tr key={row}>
                        <td className="px-2 py-2 text-sm font-semibold text-slate-400">{row}</td>
                        {legacyLayout.columns.map((column) => {
                          const mlm = legacyLayout.map.get(`${column}-${row}`)
                          return (
                            <td key={`${column}-${row}`} className="align-top">
                              {mlm ? <LegacyCell mlm={mlm} /> : <div className="h-36 rounded-2xl border border-dashed border-white/10 bg-slate-950/35" />}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    )
  }

  const grouped = {
    irrigating: list.filter((device) => getFleetBucket(device) === 'irrigating'),
    online: list.filter((device) => getFleetBucket(device) === 'online'),
    stale: list.filter((device) => getFleetBucket(device) === 'stale'),
    offline: list.filter((device) => getFleetBucket(device) === 'offline'),
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_70px_-35px_rgba(15,23,42,0.95)] backdrop-blur-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">Operations dashboard</p>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">Fleet overview</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Upgraded monitoring surface inspired by the legacy layout, focused on live fleet status, active irrigation lanes, and rapid drill-down into device behavior.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <PulseCard label="Visible devices" value={String(list.length)} note="Realtime WebSocket feed" />
            <PulseCard
              label="Latest activity"
              value={list.length > 0 ? formatLastSeen(list.reduce((latest, device) => {
                if (!device.last_seen) return latest
                if (!latest) return device.last_seen
                return new Date(device.last_seen).getTime() > new Date(latest).getTime() ? device.last_seen : latest
              }, '' as string)) : 'No packets'}
              note="Last fleet message received"
            />
            <PulseCard
              label="Recent events"
              value={String(recentEvents.length)}
              note="Buffered in current session"
            />
          </div>
        </div>
      </section>

      <StatsBar devices={list} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_360px]">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.9)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Status lanes</h2>
              <p className="mt-1 text-sm text-slate-400">Legacy-style grouped watchboard for quick operational triage.</p>
            </div>
            <Link href="/devices" className="text-sm font-medium text-cyan-300 transition-colors hover:text-cyan-200">
              Open device registry
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            <StatusLane
              label="Irrigating now"
              tone="border-sky-400/25 bg-sky-400/10 text-sky-100"
              devices={grouped.irrigating}
              emptyLabel="No active irrigation cycles"
            />
            <StatusLane
              label="Healthy live feed"
              tone="border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
              devices={grouped.online}
              emptyLabel="No devices in steady live mode"
            />
            <StatusLane
              label="Stale updates"
              tone="border-amber-400/25 bg-amber-400/10 text-amber-100"
              devices={grouped.stale}
              emptyLabel="No delayed live feeds"
            />
            <StatusLane
              label="Offline"
              tone="border-slate-400/25 bg-slate-400/10 text-slate-100"
              devices={grouped.offline}
              emptyLabel="All devices are online"
            />
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.9)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Recent activity</h2>
              <p className="mt-1 text-sm text-slate-400">Latest device events captured in this session.</p>
            </div>
            <Link href="/events" className="text-sm font-medium text-cyan-300 transition-colors hover:text-cyan-200">
              View all
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {recentEvents.slice(0, 6).map((event) => (
              <div key={event.id} className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-sm font-semibold text-white">{event.device_id}</p>
                    <p className="mt-1 text-sm text-slate-300">{event.message}</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">
                    {event.event_type.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                </p>
              </div>
            ))}

            {recentEvents.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/45 px-4 py-10 text-center text-sm text-slate-500">
                Waiting for live events from the WebSocket stream.
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Live device board</h2>
            <p className="mt-1 text-sm text-slate-400">Scrollable operational grid with visual emphasis on irrigation, stale feeds, and offline devices.</p>
          </div>
          <p className="text-sm text-slate-500">Sorted by urgency, then device ID</p>
        </div>

        <DeviceGrid devices={list} />
      </section>
    </div>
  )
}

function LegacyCell ({ mlm }: { mlm: LegacyMlm }) {
  const tone = LEGACY_STATUS_TONE[mlm.status.bg_color]

  return (
    <Link href={`/legacy/${encodeURIComponent(mlm.id)}`}>
      <div className={`h-36 min-w-[10rem] rounded-2xl border border-black/10 p-3 text-left shadow-sm transition-transform hover:-translate-y-0.5 ${tone}`}>
        <p className="font-mono text-lg font-semibold">{mlm.id}</p>
        <p className="mt-1 text-sm font-medium">{mlm.treatment_id}</p>
        <p className="text-sm">{mlm.variety_id}</p>
        <p className="mt-3 text-sm">C: {mlm.status.wt != null ? mlm.status.wt.toFixed(2) : '--'} kgs | {mlm.status.current_fc_percent != null ? mlm.status.current_fc_percent.toFixed(1) : '--'} %</p>
        <p className="text-sm">T: {mlm.target_weight.toFixed(2)} kgs | {mlm.target_fc_percent != null ? mlm.target_fc_percent.toFixed(1) : '--'} %</p>
        <p className="mt-1 text-sm font-semibold">D: {mlm.status.wt_diff_gms != null ? mlm.status.wt_diff_gms.toFixed(3) : '--'} kgs | {mlm.status.diff_fc_percent != null ? mlm.status.diff_fc_percent.toFixed(1) : '--'} %</p>
        <p className="mt-1 text-xs opacity-80">[{mlm.status.time ? formatLastSeen(mlm.status.time) : 'Never'}]</p>
      </div>
    </Link>
  )
}

function PulseCard ({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{note}</p>
    </div>
  )
}

function StatusLane ({
  label,
  tone,
  devices,
  emptyLabel,
}: {
  label: string
  tone: string
  devices: LiveDeviceData[]
  emptyLabel: string
}) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.26em]">{label}</p>
        <span className="rounded-full border border-current/20 px-2.5 py-1 text-xs font-semibold">{devices.length}</span>
      </div>

      {devices.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {devices.slice(0, 10).map((device) => (
            <Link
              key={device.device_id}
              href={`/devices/${encodeURIComponent(device.device_id)}`}
              className="rounded-full border border-current/15 bg-black/15 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/25"
            >
              {device.device_id}
            </Link>
          ))}
          {devices.length > 10 && (
            <span className="rounded-full border border-current/15 bg-black/15 px-3 py-1.5 text-xs font-medium">
              +{devices.length - 10} more
            </span>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-current/70">{emptyLabel}</p>
      )}
    </div>
  )
}
