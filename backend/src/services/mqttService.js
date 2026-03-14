'use strict'
const mqtt = require('mqtt')
const { pool } = require('../config/db')
const store = require('./deviceStore')
const { getAllConfig, getConfigSection, DEFAULTS } = require('./platformConfigService')
const { evaluateRulesForReading } = require('./irrigationRulesService')
const { markCommandAcked } = require('./commandQueueService')

let mqttClient = null
let mqttState = {
  connected: false,
  brokerUrl: null,
  lastError: null,
  lastConnectedAt: null
}

function getByPath (obj, path) {
  if (!obj || !path) return undefined
  return String(path)
    .split('.')
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj)
}

function extractDeviceIdFromTopic (topic, pattern, fallbackIndex = 1) {
  const topicParts = String(topic || '').split('/')
  const patternParts = String(pattern || '').split('/')
  const hasHashWildcard = patternParts.includes('#')

  if (!hasHashWildcard && topicParts.length !== patternParts.length) return null
  if (hasHashWildcard) {
    const hashIndex = patternParts.indexOf('#')
    const prefix = patternParts.slice(0, hashIndex)
    if (topicParts.length < prefix.length) return null
    for (let i = 0; i < prefix.length; i++) {
      const token = prefix[i]
      if (token === '{deviceId}' || token === '+') continue
      if (topicParts[i] !== token) return null
    }
    return topicParts[fallbackIndex] || null
  }

  let wildcardDeviceId = null
  for (let i = 0; i < patternParts.length; i++) {
    const currentPattern = patternParts[i]
    const currentTopic = topicParts[i]

    if (currentPattern === '{deviceId}' || currentPattern === '+') {
      if (!wildcardDeviceId) wildcardDeviceId = currentTopic
      continue
    }
    if (currentPattern !== currentTopic) return null
  }

  if (wildcardDeviceId) return wildcardDeviceId
  return topicParts[fallbackIndex] || null
}

function toSubscribePattern (pattern) {
  return String(pattern || '').replace('{deviceId}', '+')
}

// ── Helpers ──────────────────────────────────────────────────

async function logEvent (deviceId, eventType, message, metadata = {}) {
  try {
    const row = await pool.query(
      'INSERT INTO events (device_id, event_type, message, metadata) VALUES ($1,$2,$3,$4) RETURNING *',
      [deviceId, eventType, message, JSON.stringify(metadata)]
    )
    // Broadcast new event to all WS clients
    const { broadcast } = require('./wsService')
    broadcast({ type: 'event', data: row.rows[0] })
  } catch (err) {
    console.error('[mqtt] logEvent error:', err.message)
  }
}

async function ensureDeviceExists (deviceId) {
  try {
    const res = await pool.query('SELECT id, logging_enabled, weight_loss_threshold, tenant_id, site_id FROM devices WHERE id = $1', [deviceId])
    if (res.rows.length > 0) return res.rows[0]
    await pool.query(
      'INSERT INTO devices (id, name, logging_enabled) VALUES ($1,$1,true) ON CONFLICT (id) DO NOTHING',
      [deviceId]
    )
    await logEvent(deviceId, 'device_registered', `Device ${deviceId} auto-registered on first message`)
    return {
      id: deviceId,
      logging_enabled: true,
      weight_loss_threshold: DEFAULTS.rules.default_weight_loss_threshold,
      tenant_id: null,
      site_id: null
    }
  } catch (err) {
    console.error('[mqtt] ensureDeviceExists error:', err.message)
    return {
      id: deviceId,
      logging_enabled: true,
      weight_loss_threshold: DEFAULTS.rules.default_weight_loss_threshold,
      tenant_id: null,
      site_id: null
    }
  }
}

// ── MQTT Service ─────────────────────────────────────────────

async function startMqttService () {
  const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883'
  mqttState.brokerUrl = brokerUrl
  const runtimeConfig = await getAllConfig()
  const ingestion = runtimeConfig.ingestion
  const rules = runtimeConfig.rules

  const dataPattern = ingestion.data_topic_pattern || DEFAULTS.ingestion.data_topic_pattern
  const statusPattern = ingestion.status_topic_pattern || DEFAULTS.ingestion.status_topic_pattern
  const ackPattern = ingestion.ack_topic_pattern || DEFAULTS.ingestion.ack_topic_pattern
  const dataSubscribe = ingestion.data_subscribe_topic || toSubscribePattern(dataPattern)
  const statusSubscribe = ingestion.status_subscribe_topic || toSubscribePattern(statusPattern)
  const ackSubscribe = ingestion.ack_subscribe_topic || toSubscribePattern(ackPattern)

  const broadcastIntervalMs = Number(rules.broadcast_interval_ms || DEFAULTS.rules.broadcast_interval_ms)
  const offlineTimeoutMs = Number(rules.offline_timeout_ms || DEFAULTS.rules.offline_timeout_ms)

  const options = {
    clientId: `irrigation-backend-${Date.now()}`,
    clean: true,
    reconnectPeriod: 5_000,
    connectTimeout: 10_000,
  }
  if (process.env.MQTT_USERNAME) {
    options.username = process.env.MQTT_USERNAME
    options.password = process.env.MQTT_PASSWORD || ''
  }

  mqttClient = mqtt.connect(brokerUrl, options)

  mqttClient.on('connect', () => {
    console.log('[mqtt] Connected to', brokerUrl)
    mqttState.connected = true
    mqttState.lastError = null
    mqttState.lastConnectedAt = new Date().toISOString()
    mqttClient.subscribe(dataSubscribe, { qos: 1 })
    mqttClient.subscribe(statusSubscribe, { qos: 0 })
    mqttClient.subscribe(ackSubscribe, { qos: 0 })
  })

  mqttClient.on('error',     (err) => {
    mqttState.lastError = err.message
    console.error('[mqtt] Error:', err.message)
  })
  mqttClient.on('reconnect', ()    => console.log('[mqtt] Reconnecting…'))
  mqttClient.on('offline',   ()    => {
    mqttState.connected = false
    console.warn('[mqtt] Client offline')
  })
  mqttClient.on('close',     ()    => { mqttState.connected = false })

  mqttClient.on('message', async (topic, payload) => {
    try {
      let data = {}
      const payloadText = payload.toString()

      if ((liveIngestion.payload_format || 'json') === 'json') {
        try { data = JSON.parse(payloadText) } catch { return }
      }

      const liveIngestion = await getConfigSection('ingestion')

      const dataDeviceId = extractDeviceIdFromTopic(topic, liveIngestion.data_topic_pattern, liveIngestion.device_id_topic_index)
      const statusDeviceId = extractDeviceIdFromTopic(topic, liveIngestion.status_topic_pattern, liveIngestion.device_id_topic_index)
      const ackDeviceId = extractDeviceIdFromTopic(topic, liveIngestion.ack_topic_pattern, liveIngestion.device_id_topic_index)
      const isDataMessage = !!dataDeviceId
      const isStatusMessage = !!statusDeviceId
      const isAckMessage = !!ackDeviceId

      if (!isDataMessage && !isStatusMessage && !isAckMessage) return

      const payloadDeviceId = getByPath(data, liveIngestion.device_id_field)
      const deviceId = liveIngestion.device_id_source === 'payload'
        ? (payloadDeviceId || dataDeviceId || statusDeviceId || ackDeviceId)
        : (dataDeviceId || statusDeviceId || ackDeviceId || payloadDeviceId)

      if (!deviceId || String(deviceId).length > 50 || !/^[A-Za-z0-9_-]+$/.test(String(deviceId))) return

      if (isAckMessage) {
        const ackId = getByPath(data, liveIngestion.ack_id_field || DEFAULTS.ingestion.ack_id_field)
        if (!ackId) return
        await markCommandAcked(String(deviceId), String(ackId), data)
        return
      }

      const previousLive = store.getDevice(String(deviceId))
      const isJsonPayload = (liveIngestion.payload_format || 'json') === 'json'
      const normalizedWeight = isJsonPayload
        ? Number(getByPath(data, liveIngestion.weight_field))
        : Number(payloadText)
      const normalizedStatus = isJsonPayload
        ? (getByPath(data, liveIngestion.irrigation_status_field) || liveIngestion.static_irrigation_status || 'OFF')
        : (liveIngestion.static_irrigation_status || 'OFF')

      if (isDataMessage && !Number.isFinite(normalizedWeight)) return

      const cfg = await ensureDeviceExists(String(deviceId))
      if (!cfg.logging_enabled) return

      const reading = {
        weight: Number.isFinite(normalizedWeight) ? normalizedWeight : (previousLive?.weight ?? 0),
        irrigation_status: String(normalizedStatus).toUpperCase(),
        timestamp: isJsonPayload ? getByPath(data, liveIngestion.timestamp_field) : undefined
      }

      const { prev, current } = store.updateDevice(String(deviceId), reading)

      if (prev && !prev.online) {
        await logEvent(String(deviceId), 'device_online', `Device ${deviceId} back online`)
      }

      if (prev && prev.irrigation_status !== current.irrigation_status) {
        const evType = current.irrigation_status === 'ON' ? 'irrigation_on' : 'irrigation_off'
        await logEvent(String(deviceId), evType,
          `Irrigation turned ${current.irrigation_status}`,
          { weight: current.weight }
        )
      }

      if (
        isDataMessage &&
        prev &&
        Number.isFinite(prev.weight) &&
        Number.isFinite(current.weight) &&
        prev.weight > Number(cfg.weight_loss_threshold) &&
        current.weight <= Number(cfg.weight_loss_threshold)
      ) {
        await logEvent(String(deviceId), 'threshold_reached',
          `Weight crossed threshold ${cfg.weight_loss_threshold}`,
          { weight: current.weight, threshold: cfg.weight_loss_threshold }
        )
      }

      if (isDataMessage) {
        const recommendation = await evaluateRulesForReading(
          {
            device_id: String(deviceId),
            tenant_id: cfg.tenant_id,
            site_id: cfg.site_id
          },
          prev,
          current
        )

        if (recommendation) {
          const eventType = recommendation.recommended_state === 'ON'
            ? 'rule_recommendation_on'
            : 'rule_recommendation_off'

          await logEvent(
            String(deviceId),
            eventType,
            `Rule '${recommendation.rule.name}' recommends ${recommendation.recommended_state}`,
            {
              dry_run: recommendation.dry_run,
              reason: recommendation.reason,
              rule_id: recommendation.rule.id,
              rule_scope: recommendation.rule.scope_type,
              previous_weight: recommendation.previous_weight,
              current_weight: recommendation.current_weight
            }
          )
        }
      }
    } catch (err) {
      console.error('[mqtt] message handler error:', err.message)
    }
  })

  // ── WebSocket batch broadcast – every 1 second ────────────
  setInterval(() => {
    const changed = store.getChangedAndClear()
    if (changed.length === 0) return
    const { broadcast } = require('./wsService')
    broadcast({ type: 'devices_batch', timestamp: Date.now(), devices: changed })
  }, broadcastIntervalMs)

  // ── Offline detection – every 5 seconds ──────────────────
  setInterval(() => {
    store.checkOfflineDevices((deviceId, type, message) => logEvent(deviceId, type, message), offlineTimeoutMs)
  }, 5_000)

  // ── Safety monitor: irrigation ON duration ────────────────
  setInterval(async () => {
    try {
      const live = store.getAllDevices()
      const onDevices = live.filter((d) => d.irrigation_status === 'ON' && Number.isFinite(d._irrigation_on_since_ms))
      if (onDevices.length === 0) return

      const ids = onDevices.map((d) => d.device_id)
      const result = await pool.query(
        'SELECT id, max_irrigation_on_seconds FROM devices WHERE id = ANY($1)',
        [ids]
      )
      const limits = new Map(result.rows.map((r) => [r.id, Number(r.max_irrigation_on_seconds || 900)]))

      const now = Date.now()
      for (const device of onDevices) {
        const maxSeconds = limits.get(device.device_id) || 900
        const durationMs = now - device._irrigation_on_since_ms
        if (durationMs > maxSeconds * 1000 && !device._safety_cutoff_reported) {
          device._safety_cutoff_reported = true
          await logEvent(
            device.device_id,
            'irrigation_safety_cutoff',
            `Irrigation ON exceeded max duration (${maxSeconds}s)` ,
            { duration_ms: durationMs, max_seconds: maxSeconds }
          )
        }
      }
    } catch (error) {
      console.error('[mqtt] safety monitor error:', error.message)
    }
  }, 5000)
}

function getMqttStatus () {
  return {
    connected: mqttState.connected,
    brokerUrl: mqttState.brokerUrl,
    lastError: mqttState.lastError,
    lastConnectedAt: mqttState.lastConnectedAt
  }
}

async function publishCommand (deviceId, command) {
  if (!mqttClient || !mqttClient.connected) {
    throw new Error('MQTT client not connected')
  }
  const ingestionConfig = await getConfigSection('ingestion')
  const topic = String(ingestionConfig.command_topic_template || DEFAULTS.ingestion.command_topic_template)
    .replace('{deviceId}', deviceId)
  const payload = JSON.stringify(command)
  return new Promise((resolve, reject) => {
    mqttClient.publish(topic, payload, { qos: 1, retain: false }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

module.exports = { startMqttService, publishCommand, getMqttStatus }
