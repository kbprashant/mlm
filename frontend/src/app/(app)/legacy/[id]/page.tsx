'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { format, formatDistanceToNow } from 'date-fns'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '@/lib/api'
import type { LegacyMlm, LegacyMlmHistoryPoint } from '@/types'

const RANGES = [
  { label: '1 hour', value: '1h' },
  { label: '24 hours', value: '24h' },
  { label: '7 days', value: '7d' },
]

const STATUS_TONE: Record<LegacyMlm['status']['bg_color'], string> = {
  disabled: 'bg-slate-300 text-slate-900',
  ok: 'bg-lime-500 text-slate-950',
  inactive: 'bg-rose-600 text-white',
  overweight: 'bg-sky-500 text-slate-950',
  emptyoverweight: 'bg-cyan-300 text-slate-950',
  underweight: 'bg-amber-300 text-slate-950',
}

export default function LegacyMlmPage () {
  const params = useParams<{ id: string }>()
  const id = decodeURIComponent(params.id)

  const [mlm, setMlm] = useState<LegacyMlm | null>(null)
  const [history, setHistory] = useState<LegacyMlmHistoryPoint[]>([])
  const [range, setRange] = useState('24h')
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [error, setError] = useState('')

  const loadMlm = useCallback(() => {
    setLoading(true)
    setError('')
    api.getLegacyMlm(id)
      .then(setMlm)
      .catch((loadError: Error) => setError(loadError.message))
      .finally(() => setLoading(false))
  }, [id])

  const loadHistory = useCallback(() => {
    setHistoryLoading(true)
    api.getLegacyMlmHistory(id, range)
      .then(setHistory)
      .catch((loadError: Error) => setError(loadError.message))
      .finally(() => setHistoryLoading(false))
  }, [id, range])

  useEffect(() => { loadMlm() }, [loadMlm])
  useEffect(() => { loadHistory() }, [loadHistory])

  const chartData = useMemo(() => history.map((point) => ({
    ...point,
    label: format(new Date(point.time), range === '7d' ? 'MMM d HH:mm' : 'HH:mm'),
  })), [history, range])

  if (loading) return <div className="p-4 text-slate-400">Loading legacy MLM…</div>
  if (!mlm) return <div className="p-4 text-rose-300">{error || 'Legacy MLM not found'}</div>

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_70px_-35px_rgba(15,23,42,0.95)] backdrop-blur-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">Legacy MLM detail</p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-3xl font-semibold tracking-tight text-white">{mlm.id}</h1>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${STATUS_TONE[mlm.status.bg_color]}`}>
                {mlm.status.bg_color}
              </span>
            </div>
            <p className="max-w-3xl text-sm text-slate-400">{mlm.short_description || 'No description'}{mlm.details ? ` • ${mlm.details}` : ''}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <HeaderStat label="Site" value={mlm.site} />
            <HeaderStat label="Last reading" value={mlm.status.time ? formatDistanceToNow(new Date(mlm.status.time), { addSuffix: true }) : 'Never'} />
            <HeaderStat label="Treatment target" value={mlm.target_fc_percent != null ? `${mlm.target_fc_percent.toFixed(1)} % FC` : 'Not set'} />
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Current weight" value={mlm.status.wt != null ? `${mlm.status.wt.toFixed(2)} kgs` : 'No reading'} />
        <Metric label="Target weight" value={`${mlm.target_weight.toFixed(2)} kgs`} />
        <Metric label="Weight diff" value={mlm.status.wt_diff_gms != null ? `${mlm.status.wt_diff_gms.toFixed(3)} kgs` : 'No reading'} />
        <Metric label="Current FC" value={mlm.status.current_fc_percent != null ? `${mlm.status.current_fc_percent.toFixed(1)} %` : 'No reading'} />
        <Metric label="100% FC" value={`${mlm.fc100_weight.toFixed(2)} kgs`} />
        <Metric label="0% FC" value={`${mlm.fc0_weight.toFixed(2)} kgs`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.9)] backdrop-blur-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Weight history</h2>
              <p className="mt-1 text-sm text-slate-400">Legacy fc measurement rendered directly inside the new app.</p>
            </div>
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
          </div>

          {historyLoading ? (
            <div className="mt-5 flex h-80 items-center justify-center text-slate-400">Loading history…</div>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" minTickGap={28} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={68} />
                  <Tooltip content={<LegacyHistoryTooltip />} />
                  <Line type="monotone" dataKey="weight" stroke="#22d3ee" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <ReferenceLine y={mlm.target_weight} stroke="#f59e0b" strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.9)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-white">Configuration</h2>
            <div className="mt-5 space-y-4">
              <Row label="Pot ID" value={mlm.pot_id} />
              <Row label="Treatment" value={`${mlm.treatment_id} | ${mlm.treatment_description}`} />
              <Row label="Variety" value={`${mlm.variety_id} | ${mlm.variety_description}`} />
              <Row label="Experiment" value={`${mlm.experiment_id} | ${mlm.experiment_description}`} />
              <Row label="Enabled" value={mlm.is_enabled ? 'Yes' : 'No'} />
              <Row label="Created" value={format(new Date(mlm.created_on), 'MMM d, yyyy HH:mm')} />
              <Row label="Modified" value={format(new Date(mlm.modified_on), 'MMM d, yyyy HH:mm')} />
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.9)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-white">Recent samples</h2>
            <div className="mt-5 space-y-3">
              {history.slice(-6).reverse().map((point) => (
                <div key={point.time} className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
                  <p className="text-sm font-medium text-white">{format(new Date(point.time), 'MMM d, HH:mm:ss')}</p>
                  <p className="mt-1 text-sm text-slate-300">Weight: {point.weight != null ? `${point.weight.toFixed(2)} kgs` : '—'}</p>
                  <p className="text-sm text-slate-400">Target: {point.target_weight != null ? `${point.target_weight.toFixed(2)} kgs` : '—'}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
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

function Metric ({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.85)]">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-3 text-xl font-semibold text-white">{value}</p>
    </div>
  )
}

function Row ({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium text-slate-200">{value}</span>
    </div>
  )
}

function LegacyHistoryTooltip ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey?: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-sm shadow-xl">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="mt-1 text-slate-200">{entry.dataKey}: {entry.value}</p>
      ))}
    </div>
  )
}