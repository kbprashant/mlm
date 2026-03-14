'use client'

import { useState } from 'react'
import { api }      from '@/lib/api'

interface Props {
  deviceId: string
}

export default function CommandPanel ({ deviceId }: Props) {
  const [refWeight, setRefWeight] = useState<string>('20')
  const [status,    setStatus]    = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [loading,   setLoading]   = useState<string | null>(null)

  async function send (command: 'tare' | 'calibrate') {
    setStatus(null)
    setLoading(command)
    try {
      const payload: Parameters<typeof api.sendCommand>[1] = command === 'calibrate'
        ? { command, reference_weight: parseFloat(refWeight) }
        : { command }
      const res = await api.sendCommand(deviceId, payload)
      setStatus({ type: 'ok',  msg: res.message })
    } catch (err: unknown) {
      setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <h3 className="font-semibold text-sm text-gray-300">Device Commands</h3>

      {status && (
        <p className={`text-sm rounded-lg px-3 py-2 ${
          status.type === 'ok'
            ? 'text-green-400 bg-green-900/30 border border-green-800'
            : 'text-red-400 bg-red-900/30 border border-red-800'
        }`}>
          {status.msg}
        </p>
      )}

      {/* Tare */}
      <div>
        <button
          onClick={() => send('tare')}
          disabled={loading !== null}
          className="w-full bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50
                     text-white font-semibold py-2 rounded-lg transition-colors text-sm"
        >
          {loading === 'tare' ? 'Sending…' : '⟳  Tare (Zero Scale)'}
        </button>
        <p className="text-xs text-gray-500 mt-1">Resets the scale to zero immediately.</p>
      </div>

      {/* Calibrate */}
      <div className="space-y-2">
        <label className="block text-xs text-gray-400">
          Reference weight (grams)
          <input
            type="number"
            min="0.001"
            step="0.001"
            value={refWeight}
            onChange={(e) => setRefWeight(e.target.value)}
            className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5
                       text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <button
          onClick={() => send('calibrate')}
          disabled={loading !== null || !refWeight}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50
                     text-white font-semibold py-2 rounded-lg transition-colors text-sm"
        >
          {loading === 'calibrate' ? 'Sending…' : '⚖  Start Calibration'}
        </button>
        <p className="text-xs text-gray-500">
          Place the reference weight on the scale when prompted by the device.
        </p>
      </div>
    </div>
  )
}
