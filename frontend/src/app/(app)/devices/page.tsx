'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { Device } from '@/types'
import { useDeviceStore } from '@/store/deviceStore'
import StatusBadge from '@/components/ui/StatusBadge'

export default function DevicesPage () {
  const [devices, setDevices] = useState<Device[]>([])
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(true)
  const liveDevices = useDeviceStore((s) => s.devices)

  useEffect(() => {
    api.getDevices()
      .then(setDevices)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = devices.filter((d) =>
    d.id.toLowerCase().includes(search.toLowerCase()) ||
    d.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Devices</h1>
      </div>

      <input
        type="search"
        placeholder="Search by ID or name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-gray-400 text-left">
              <tr>
                <th className="px-4 py-3">Device ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Weight (g)</th>
                <th className="px-4 py-3">Irrigation</th>
                <th className="px-4 py-3">Logging</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const live = liveDevices[d.id]
                return (
                  <tr key={d.id} className="border-t border-gray-800 hover:bg-gray-900 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium">
                      <Link href={`/devices/${d.id}`} className="text-blue-400 hover:underline">
                        {d.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{d.name || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge online={live?.online ?? false} />
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {live?.weight != null ? live.weight.toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {live ? (
                        <span className={`font-semibold ${live.irrigation_status === 'ON' ? 'text-blue-400' : 'text-gray-400'}`}>
                          {live.irrigation_status}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={d.logging_enabled ? 'text-green-400' : 'text-red-400'}>
                        {d.logging_enabled ? 'ON' : 'OFF'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    {search ? 'No devices match your search' : 'No devices registered yet'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
