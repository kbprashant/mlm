'use client'

import { useEffect, useState } from 'react'
import { api }             from '@/lib/api'
import { useDeviceStore }  from '@/store/deviceStore'
import type { DeviceEvent } from '@/types'
import { format }          from 'date-fns'

const EVENT_COLORS: Record<string, string> = {
  irrigation_on:        'text-blue-400',
  irrigation_off:       'text-gray-400',
  device_online:        'text-green-400',
  device_offline:       'text-red-400',
  threshold_reached:    'text-orange-400',
  calibration_start:    'text-purple-400',
  calibration_complete: 'text-purple-300',
  tare_command:         'text-yellow-400',
  logging_changed:      'text-teal-400',
  device_registered:    'text-cyan-400',
}

interface Props {
  deviceId?:   string
  showFilters?: boolean
}

const PAGE_SIZE = 50

export default function EventLog ({ deviceId, showFilters = false }: Props) {
  const [events,  setEvents]  = useState<DeviceEvent[]>([])
  const [total,   setTotal]   = useState(0)
  const [offset,  setOffset]  = useState(0)
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')

  // Prepend events arriving via WebSocket
  const recentWsEvents = useDeviceStore((s) => s.recentEvents)

  useEffect(() => {
    setLoading(true)
    api.getEvents({ device_id: deviceId, type: filterType || undefined, limit: PAGE_SIZE, offset })
      .then(({ events: ev, total: t }) => { setEvents(ev); setTotal(t) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [deviceId, filterType, offset])

  // Show new WS events at the top when on first page
  const displayed: DeviceEvent[] = offset === 0
    ? [
        ...recentWsEvents.filter((e) =>
          (!deviceId || e.device_id === deviceId) &&
          (!filterType || e.event_type === filterType) &&
          !events.find((r) => r.id === e.id)
        ),
        ...events,
      ]
    : events

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {showFilters && (
        <div className="px-4 py-3 border-b border-gray-800 flex gap-3">
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setOffset(0) }}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All event types</option>
            {Object.keys(EVENT_COLORS).map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Time</th>
              {!deviceId && <th className="px-4 py-2 text-left">Device</th>}
              <th className="px-4 py-2 text-left">Event</th>
              <th className="px-4 py-2 text-left">Message</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
            )}
            {!loading && displayed.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No events</td></tr>
            )}
            {!loading && displayed.map((e) => (
              <tr key={e.id ?? `${e.device_id}-${e.created_at}`}
                  className="border-t border-gray-800/60 hover:bg-gray-800/40 transition-colors">
                <td className="px-4 py-2 font-mono text-xs text-gray-400 whitespace-nowrap">
                  {format(new Date(e.created_at), 'MM-dd HH:mm:ss')}
                </td>
                {!deviceId && (
                  <td className="px-4 py-2 font-mono text-xs">{e.device_id}</td>
                )}
                <td className={`px-4 py-2 text-xs font-medium ${EVENT_COLORS[e.event_type] || 'text-gray-300'}`}>
                  {e.event_type.replace(/_/g, ' ')}
                </td>
                <td className="px-4 py-2 text-xs text-gray-300">{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between text-sm text-gray-400">
          <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="px-3 py-1 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              ← Prev
            </button>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="px-3 py-1 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
