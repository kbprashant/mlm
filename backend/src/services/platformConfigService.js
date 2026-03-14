'use strict'
const { pool } = require('../config/db')

const ALLOWED_SECTIONS = ['ingestion', 'rules']

const DEFAULTS = {
  ingestion: {
    data_topic_pattern: 'devices/{deviceId}/data',
    status_topic_pattern: 'devices/{deviceId}/status',
    ack_topic_pattern: 'devices/{deviceId}/ack',
    data_subscribe_topic: 'devices/+/data',
    status_subscribe_topic: 'devices/+/status',
    ack_subscribe_topic: 'devices/+/ack',
    command_topic_template: 'devices/{deviceId}/commands',
    device_id_source: 'topic',
    device_id_topic_index: 1,
    payload_format: 'json',
    device_id_field: 'device_id',
    weight_field: 'weight',
    irrigation_status_field: 'irrigation_status',
    timestamp_field: 'timestamp',
    static_irrigation_status: 'OFF',
    ack_id_field: 'command_id'
  },
  rules: {
    offline_timeout_ms: 10000,
    broadcast_interval_ms: 1000,
    default_weight_loss_threshold: 50,
    command_require_ack: false,
    command_ack_timeout_ms: 20000,
    command_retry_interval_ms: 8000,
    command_max_retries: 3
  }
}

const cache = new Map()

async function initPlatformConfig () {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_config (
      section     VARCHAR(32) PRIMARY KEY,
      config      JSONB       NOT NULL DEFAULT '{}',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  for (const section of ALLOWED_SECTIONS) {
    const existing = await pool.query('SELECT section FROM platform_config WHERE section = $1', [section])
    if (existing.rows.length === 0) {
      await pool.query(
        'INSERT INTO platform_config (section, config) VALUES ($1, $2)',
        [section, JSON.stringify(DEFAULTS[section])]
      )
    }
  }
}

function validateSection (section) {
  if (!ALLOWED_SECTIONS.includes(section)) {
    throw new Error(`Invalid config section '${section}'`)
  }
}

function mergeWithDefaults (section, config) {
  return { ...DEFAULTS[section], ...(config || {}) }
}

async function getConfigSection (section, { fresh = false } = {}) {
  validateSection(section)
  if (!fresh && cache.has(section)) return cache.get(section)

  const result = await pool.query('SELECT config FROM platform_config WHERE section = $1', [section])
  const merged = mergeWithDefaults(section, result.rows[0]?.config)
  cache.set(section, merged)
  return merged
}

async function getAllConfig ({ fresh = false } = {}) {
  const [ingestion, rules] = await Promise.all([
    getConfigSection('ingestion', { fresh }),
    getConfigSection('rules', { fresh })
  ])
  return { ingestion, rules }
}

async function updateConfigSection (section, patch) {
  validateSection(section)
  const current = await getConfigSection(section, { fresh: true })
  const merged = { ...current, ...patch }

  await pool.query(
    `INSERT INTO platform_config (section, config, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (section)
     DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()`,
    [section, JSON.stringify(merged)]
  )
  cache.set(section, merged)
  return merged
}

module.exports = {
  DEFAULTS,
  initPlatformConfig,
  getConfigSection,
  getAllConfig,
  updateConfigSection
}
