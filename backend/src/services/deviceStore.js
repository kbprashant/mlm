'use strict'
/**
 * In-memory device state store.
 * Holds the latest reading for every device plus tracks which devices
 * changed since the last WebSocket broadcast.
 */

/** @type {Map<string, import('../types').LiveDevice>} */
const store = new Map()

/** Tracks device IDs that changed since the last getChangedAndClear() call */
const changed = new Set()

function updateDevice (deviceId, data) {
  const prev = store.get(deviceId)
  const now = Date.now()
  const nextStatus = data.irrigation_status || 'OFF'
  const statusChanged = prev ? prev.irrigation_status !== nextStatus : true

  let irrigationOnSinceMs = prev?._irrigation_on_since_ms || null
  let safetyCutoffReported = prev?._safety_cutoff_reported || false

  if (nextStatus === 'ON' && (!prev || prev.irrigation_status !== 'ON')) {
    irrigationOnSinceMs = now
    safetyCutoffReported = false
  }
  if (nextStatus !== 'ON') {
    irrigationOnSinceMs = null
    safetyCutoffReported = false
  }

  const updated = {
    device_id:         deviceId,
    weight:            data.weight,
    irrigation_status: nextStatus,
    online:            true,
    last_seen:         new Date(now).toISOString(),
    _last_seen_ms:     now,
    _irrigation_on_since_ms: irrigationOnSinceMs,
    _safety_cutoff_reported: safetyCutoffReported,
  }
  store.set(deviceId, updated)
  if (!prev || statusChanged || prev.weight !== updated.weight || !prev.online) {
    changed.add(deviceId)
  }
  return { prev, current: updated }
}

function getDevice (deviceId) {
  return store.get(deviceId) || null
}

function getAllDevices () {
  return Array.from(store.values())
}

/**
 * Returns all devices that changed since the last call and clears the set.
 * Called by the 1-second WebSocket broadcast interval.
 */
function getChangedAndClear () {
  const snapshot = Array.from(changed)
    .map((id) => store.get(id))
    .filter(Boolean)
  changed.clear()
  return snapshot
}

/**
 * Check for devices that haven't sent data in > 10 seconds.
 * @param {(deviceId: string, type: string, message: string) => void} onOffline
 */
function checkOfflineDevices (onOffline, offlineTimeoutMs = 10_000) {
  const now = Date.now()
  for (const [deviceId, device] of store) {
    if (device.online && now - (device._last_seen_ms || 0) > offlineTimeoutMs) {
      device.online = false
      changed.add(deviceId)
      onOffline(deviceId, 'device_offline', `Device ${deviceId} went offline`)
    }
  }
}

module.exports = { updateDevice, getDevice, getAllDevices, getChangedAndClear, checkOfflineDevices }
