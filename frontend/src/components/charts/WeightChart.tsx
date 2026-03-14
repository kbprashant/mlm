'use client'

import { useEffect, useState, useCallback } from 'react'
import { api }                from '@/lib/api'
import type { DataPoint }     from '@/types'
import { format }             from 'date-fns'
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, Brush,
} from 'recharts'

interface Props {
  deviceId: string
  range?:   string
  height?:  number
}

export default function WeightChart ({ deviceId, range = '1h', height = 320 }: Props) {
  const [data,    setData]    = useState<DataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api.getData(deviceId, range)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [deviceId, range])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="h-40 flex items-center justify-center text-gray-400">Loading chart…</div>
  if (error)   return <div className="h-40 flex items-center justify-center text-red-400">{error}</div>
  if (data.length === 0) return (
    <div className="h-40 flex items-center justify-center text-gray-500">
      No data for this range
    </div>
  )

  // Mark irrigation-ON transitions for reference lines
  const irrigOnTimes = data
    .filter((d, i) => i > 0 && d.irrigation_status === 'ON' && data[i - 1].irrigation_status === 'OFF')
    .map((d) => d.time)

  const formatted = data.map((d) => ({
    ...d,
    _ts: new Date(d.time).getTime(),
    _label: format(new Date(d.time), 'HH:mm:ss'),
  }))

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-300">Weight over time</h2>
        <button
          onClick={load}
          className="text-xs text-blue-400 hover:underline"
        >
          Refresh
        </button>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={formatted} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="_label"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            label={{ value: 'g', position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
            labelStyle={{ color: '#9ca3af', fontSize: 11 }}
            formatter={(value: number) => [`${value.toFixed(2)} g`, 'Weight']}
          />
          <Legend iconType="line" wrapperStyle={{ fontSize: 12 }} />

          <Line
            type="monotone"
            dataKey="weight"
            stroke="#3b82f6"
            dot={false}
            strokeWidth={1.5}
            name="Weight (g)"
            isAnimationActive={false}
          />

          {/* Vertical lines at irrigation start events */}
          {irrigOnTimes.map((t) => (
            <ReferenceLine
              key={t}
              x={format(new Date(t), 'HH:mm:ss')}
              stroke="#60a5fa"
              strokeDasharray="4 2"
              label={{ value: '💧', position: 'top', fontSize: 10 }}
            />
          ))}

          <Brush dataKey="_label" height={24} stroke="#374151" fill="#1f2937" travellerWidth={6} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
