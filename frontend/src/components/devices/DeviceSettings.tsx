'use client'

import { useState } from 'react'
import { api }          from '@/lib/api'
import type { Device }  from '@/types'

interface Props {
  device:   Device
  onUpdate: (d: Device) => void
}

export default function DeviceSettings ({ device, onUpdate }: Props) {
  const [threshold, setThreshold] = useState(String(device.weight_loss_threshold))
  const [logging,   setLogging]   = useState(device.logging_enabled)
  const [saving,    setSaving]    = useState(false)
  const [status,    setStatus]    = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  async function save () {
    setSaving(true)
    setStatus(null)
    try {
      const updated = await api.updateDevice(device.id, {
        weight_loss_threshold: parseFloat(threshold),
        logging_enabled:       logging,
      })
      onUpdate(updated)
      setStatus({ type: 'ok', msg: 'Settings saved' })
    } catch (err: unknown) {
      setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-sm text-gray-300">Device Settings</h3>

      {status && (
        <p className={`text-sm rounded-lg px-3 py-2 ${
          status.type === 'ok'
            ? 'text-green-400 bg-green-900/30 border border-green-800'
            : 'text-red-400 bg-red-900/30 border border-red-800'
        }`}>
          {status.msg}
        </p>
      )}

      <label className="block text-xs text-gray-400">
        Weight-loss trigger (grams)
        <input
          type="number"
          min="0"
          step="0.1"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5
                     text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="block mt-1 text-gray-500">
          Irrigate when weight drops by this amount from baseline.
        </span>
      </label>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 font-medium">Data Logging</p>
          <p className="text-xs text-gray-500">When off, messages from this device are ignored.</p>
        </div>
        <button
          onClick={() => setLogging((v) => !v)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
            ${logging ? 'bg-blue-600' : 'bg-gray-700'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
            ${logging ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                   text-white font-semibold py-2 rounded-lg transition-colors text-sm"
      >
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  )
}
