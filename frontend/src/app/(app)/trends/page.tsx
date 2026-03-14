'use client'

import { useEffect, useState, useCallback } from 'react'
import { api }         from '@/lib/api'
import type { DataPoint } from '@/types'
import WeightChart     from '@/components/charts/WeightChart'

const RANGES = [
  { label: '10 min', value: '10m' },
  { label: '1 hour', value: '1h' },
  { label: '24 hours', value: '24h' },
  { label: '7 days',  value: '7d' },
]

export default function TrendsPage () {
  const [deviceId, setDeviceId]   = useState('')
  const [deviceIds, setDeviceIds] = useState<string[]>([])
  const [range, setRange]         = useState('1h')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    api.getDevices().then((ds) => {
      const ids = ds.map((d) => d.id)
      setDeviceIds(ids)
      if (ids.length > 0) setDeviceId(ids[0])
    }).catch(console.error)
  }, [])

  const handleExport = useCallback(async (format: 'csv' | 'excel') => {
    if (!deviceId) return
    setExporting(true)
    try { await api.exportData(deviceId, range, format) }
    catch (err) { console.error(err) }
    finally { setExporting(false) }
  }, [deviceId, range])

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Trends</h1>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {deviceIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>

        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-2 text-sm transition-colors
                ${range === r.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-2">
          <button
            onClick={() => handleExport('csv')}
            disabled={!deviceId || exporting}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-sm px-3 py-2 rounded-lg transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={() => handleExport('excel')}
            disabled={!deviceId || exporting}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-sm px-3 py-2 rounded-lg transition-colors"
          >
            Export Excel
          </button>
        </div>
      </div>

      {deviceId ? (
        <WeightChart deviceId={deviceId} range={range} height={480} />
      ) : (
        <p className="text-gray-400">No devices available</p>
      )}
    </div>
  )
}
