'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams }    from 'next/navigation'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api }          from '@/lib/api'
import type { DataPoint, Device }  from '@/types'
import { useDeviceStore } from '@/store/deviceStore'
import CommandPanel     from '@/components/devices/CommandPanel'
import DeviceSettings   from '@/components/devices/DeviceSettings'
import EventLog         from '@/components/events/EventLog'
import StatusBadge      from '@/components/ui/StatusBadge'
import { formatLastSeen, summarizeHistory } from '@/lib/deviceMetrics'

const RANGES = [
  { label: '1 hour', value: '1h' },
  { label: '24 hours', value: '24h' },
  { label: '7 days', value: '7d' },
]

export default function DeviceDetailPage () {
  const params = useParams<{ id: string }>()
  const id     = decodeURIComponent(params.id)

  const [device,  setDevice]  = useState<Device | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('24h')
  const [history, setHistory] = useState<DataPoint[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const live = useDeviceStore((s) => s.devices[id])

  const loadDevice = useCallback(() => {
    setLoading(true)
    api.getDevice(id)
      .then(setDevice)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  const loadHistory = useCallback(() => {
    setHistoryLoading(true)
    setHistoryError('')
    api.getData(id, range)
      .then(setHistory)
      .catch((error: Error) => setHistoryError(error.message))
      .finally(() => setHistoryLoading(false))
  }, [id, range])

  useEffect(() => {
    loadDevice()
  }, [loadDevice])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const liveSnapshot = live ?? device?.live ?? null
  const historySummary = useMemo(() => summarizeHistory(history), [history])

  const chartData = useMemo(() => {
    return history.map((point, index) => ({
      ...point,
      label: formatLabel(point.time, range),
      delta: index === 0 ? 0 : Number((point.weight - history[index - 1].weight).toFixed(3)),
      irrigationLevel: point.irrigation_status === 'ON' ? 1 : 0,
    }))
  }, [history, range])

  const thresholdRatio =
    historySummary.dropFromPeak != null && device?.weight_loss_threshold != null && device.weight_loss_threshold > 0
      ? historySummary.dropFromPeak / device.weight_loss_threshold
      : null

  const recentRows = history.slice(-8).reverse()

  if (loading) return <p className="text-gray-400 p-4">Loading…</p>
  if (!device)  return <p className="text-red-400  p-4">Device not found</p>

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_70px_-35px_rgba(15,23,42,0.95)] backdrop-blur-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">Device dashboard</p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-3xl font-semibold tracking-tight text-white">{device.id}</h1>
              <StatusBadge online={liveSnapshot?.online ?? false} />
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${liveSnapshot?.irrigation_status === 'ON' ? 'border-sky-400/30 bg-sky-400/15 text-sky-200' : 'border-white/10 bg-white/5 text-slate-300'}`}>
                {liveSnapshot?.irrigation_status === 'ON' ? 'Irrigation active' : 'Standing by'}
              </span>
            </div>
            <p className="max-w-3xl text-sm text-slate-400">
              {device.name || 'No display name configured'}
              {device.description ? ` • ${device.description}` : ''}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <HeaderStat label="Last live packet" value={liveSnapshot?.last_seen ? formatLastSeen(liveSnapshot.last_seen) : 'Waiting for data'} />
            <HeaderStat label="History window" value={range.toUpperCase()} />
            <HeaderStat label="Samples loaded" value={String(historySummary.sampleCount)} />
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Current weight" value={liveSnapshot?.weight != null ? `${liveSnapshot.weight.toFixed(2)} g` : 'No live reading'} />
        <MetricCard
          label="Window delta"
          value={historySummary.delta != null ? `${historySummary.delta >= 0 ? '+' : ''}${historySummary.delta.toFixed(2)} g` : 'No history'}
          tone={historySummary.delta != null && historySummary.delta < 0 ? 'warning' : 'default'}
        />
        <MetricCard
          label="Observed range"
          value={historySummary.minWeight != null && historySummary.maxWeight != null
            ? `${historySummary.minWeight.toFixed(2)} - ${historySummary.maxWeight.toFixed(2)} g`
            : 'No history'}
        />
        <MetricCard
          label="Drop vs threshold"
          value={historySummary.dropFromPeak != null
            ? `${historySummary.dropFromPeak.toFixed(2)} / ${device.weight_loss_threshold.toFixed(2)} g`
            : `${device.weight_loss_threshold.toFixed(2)} g limit`}
          tone={thresholdRatio != null && thresholdRatio >= 1 ? 'danger' : thresholdRatio != null && thresholdRatio >= 0.7 ? 'warning' : 'default'}
        />
        <MetricCard label="Irrigation starts" value={String(historySummary.irrigationStarts)} tone={historySummary.irrigationStarts > 0 ? 'info' : 'default'} />
        <MetricCard label="Logging" value={device.logging_enabled ? 'Enabled' : 'Disabled'} tone={device.logging_enabled ? 'success' : 'default'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.9)] backdrop-blur-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Historical trend analysis</h2>
              <p className="mt-1 text-sm text-slate-400">Legacy-inspired multi-panel view built from the stored weight series and irrigation states.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-full border border-white/10 bg-slate-950/70 p-1">
                {RANGES.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setRange(option.value)}
                    className={`rounded-full px-3 py-1.5 text-sm transition-colors ${range === option.value ? 'bg-cyan-400/20 text-cyan-200' : 'text-slate-400 hover:text-white'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                onClick={loadHistory}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10"
              >
                Refresh history
              </button>
            </div>
          </div>

          {historyLoading ? (
            <div className="flex h-[22rem] items-center justify-center text-slate-400">Loading historical data…</div>
          ) : historyError ? (
            <div className="flex h-[22rem] items-center justify-center text-red-300">{historyError}</div>
          ) : chartData.length === 0 ? (
            <div className="flex h-[22rem] items-center justify-center text-slate-500">No historical data for the selected window.</div>
          ) : (
            <div className="mt-5 space-y-6">
              <ChartPanel title="Weight profile" subtitle="Live weight plotted across the selected history window.">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" minTickGap={28} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={68} />
                    <Tooltip content={<HistoryTooltip />} />
                    <Line type="monotone" dataKey="weight" stroke="#22d3ee" strokeWidth={2} dot={false} isAnimationActive={false} />
                    {historySummary.averageWeight != null && (
                      <ReferenceLine y={historySummary.averageWeight} stroke="#f59e0b" strokeDasharray="4 4" />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>

              <div className="grid gap-6 lg:grid-cols-2">
                <ChartPanel title="Weight delta" subtitle="Point-to-point changes help expose dry-down speed and sudden jumps.">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" />
                      <XAxis dataKey="label" minTickGap={28} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={60} />
                      <Tooltip content={<HistoryTooltip />} />
                      <ReferenceLine y={0} stroke="rgba(148,163,184,0.5)" />
                      <Bar dataKey="delta" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartPanel>

                <ChartPanel title="Irrigation activity" subtitle="Binary irrigation state derived from recorded device telemetry.">
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="irrigationFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.45} />
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" />
                      <XAxis dataKey="label" minTickGap={28} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={42} domain={[0, 1]} tickFormatter={(value) => (value === 1 ? 'ON' : 'OFF')} />
                      <Tooltip content={<HistoryTooltip />} />
                      <Area type="stepAfter" dataKey="irrigationLevel" stroke="#38bdf8" fill="url(#irrigationFill)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartPanel>
              </div>

              <ChartPanel title="Recent readings" subtitle="Most recent stored samples inside the selected history window.">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-slate-500">
                      <tr>
                        <th className="pb-3 pr-4 font-medium">Time</th>
                        <th className="pb-3 pr-4 font-medium">Weight</th>
                        <th className="pb-3 pr-4 font-medium">Irrigation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRows.map((row) => (
                        <tr key={row.time} className="border-t border-white/5 text-slate-300">
                          <td className="py-3 pr-4">{format(new Date(row.time), 'MMM d, HH:mm:ss')}</td>
                          <td className="py-3 pr-4 font-mono">{row.weight.toFixed(2)} g</td>
                          <td className="py-3 pr-4">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.irrigation_status === 'ON' ? 'bg-sky-400/15 text-sky-200' : 'bg-white/5 text-slate-300'}`}>
                              {row.irrigation_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartPanel>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.9)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-white">Operational snapshot</h2>
            <div className="mt-5 space-y-4">
              <SnapshotRow label="Live status" value={liveSnapshot?.online ? 'Online' : 'Offline'} />
              <SnapshotRow label="Last seen" value={liveSnapshot?.last_seen ? formatLastSeen(liveSnapshot.last_seen) : 'No heartbeat'} />
              <SnapshotRow label="Latest weight" value={historySummary.currentWeight != null ? `${historySummary.currentWeight.toFixed(2)} g` : 'No historical samples'} />
              <SnapshotRow label="Average weight" value={historySummary.averageWeight != null ? `${historySummary.averageWeight.toFixed(2)} g` : 'No historical samples'} />
              <SnapshotRow label="Volatility" value={historySummary.volatility != null ? `${historySummary.volatility.toFixed(3)} g / sample` : 'Not enough samples'} />
              <SnapshotRow label="Latest history point" value={historySummary.lastTimestamp ? formatDistanceToNow(new Date(historySummary.lastTimestamp), { addSuffix: true }) : 'No stored samples'} />
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/65 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Assessment</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                {thresholdRatio != null && thresholdRatio >= 1
                  ? 'Observed drop from the local peak has crossed the configured threshold, so this device should be reviewed first.'
                  : thresholdRatio != null && thresholdRatio >= 0.7
                    ? 'Observed drop is approaching the configured threshold. Keep this device in the active watch list.'
                    : liveSnapshot?.online
                      ? 'Telemetry is flowing and the recent history is within the configured threshold window.'
                      : 'Device is currently offline. Historical data is still available for review, but live status should be checked.'}
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.9)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-white">Configuration</h2>
            <div className="mt-5 space-y-4">
              <SnapshotRow label="Display name" value={device.name || 'Not configured'} />
              <SnapshotRow label="Threshold" value={`${device.weight_loss_threshold.toFixed(2)} g`} />
              <SnapshotRow label="Logging" value={device.logging_enabled ? 'Enabled' : 'Disabled'} />
              <SnapshotRow label="Created" value={format(new Date(device.created_at), 'MMM d, yyyy HH:mm')} />
              <SnapshotRow label="Updated" value={format(new Date(device.updated_at), 'MMM d, yyyy HH:mm')} />
            </div>
          </section>

          <CommandPanel deviceId={id} />
          <DeviceSettings device={device} onUpdate={setDevice} />
        </div>
      </div>

      <EventLog deviceId={id} />
    </div>
  )
}

function HeaderStat ({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}

function MetricCard ({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'success' | 'info' | 'warning' | 'danger'
}) {
  const toneClasses =
    tone === 'success'
      ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
      : tone === 'info'
        ? 'border-sky-400/20 bg-sky-400/10 text-sky-100'
        : tone === 'warning'
          ? 'border-amber-400/20 bg-amber-400/10 text-amber-100'
          : tone === 'danger'
            ? 'border-rose-400/20 bg-rose-400/10 text-rose-100'
            : 'border-white/10 bg-white/5 text-white'

  return (
    <div className={`rounded-2xl border px-4 py-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.85)] ${toneClasses}`}>
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-3 text-xl font-semibold leading-tight">{value}</p>
    </div>
  )
}

function ChartPanel ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function SnapshotRow ({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium text-slate-200">{value}</span>
    </div>
  )
}

function HistoryTooltip ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey?: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-sm shadow-xl">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="mt-1 text-slate-200">
          {entry.dataKey === 'irrigationLevel'
            ? `Irrigation: ${entry.value === 1 ? 'ON' : 'OFF'}`
            : `${entry.dataKey}: ${entry.value}`}
        </p>
      ))}
    </div>
  )
}

function formatLabel(time: string, range: string) {
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return time

  if (range === '7d') return format(date, 'MMM d HH:mm')
  return format(date, 'HH:mm')
}
