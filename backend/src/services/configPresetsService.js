'use strict'

const { updateConfigSection } = require('./platformConfigService')

const PRESETS = {
  modern_devices_json: {
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
  },
  legacy_mlm_numeric: {
    ingestion: {
      data_topic_pattern: 'disabled/{deviceId}',
      status_topic_pattern: 'ctl/{deviceId}',
      ack_topic_pattern: 'ack/{deviceId}',
      data_subscribe_topic: 'disabled/#',
      status_subscribe_topic: 'ctl/#',
      ack_subscribe_topic: 'ack/#',
      command_topic_template: 'cfg/{deviceId}',
      device_id_source: 'topic',
      device_id_topic_index: 1,
      payload_format: 'number',
      device_id_field: 'device_id',
      weight_field: 'weight',
      irrigation_status_field: 'irrigation_status',
      timestamp_field: 'timestamp',
      static_irrigation_status: 'OFF',
      ack_id_field: 'command_id'
    },
    rules: {
      offline_timeout_ms: 20000,
      broadcast_interval_ms: 1000,
      default_weight_loss_threshold: 50,
      command_require_ack: false,
      command_ack_timeout_ms: 30000,
      command_retry_interval_ms: 10000,
      command_max_retries: 3
    }
  }
}

function listPresets () {
  return Object.keys(PRESETS)
}

async function applyPreset (name) {
  const preset = PRESETS[name]
  if (!preset) throw new Error(`Unknown preset '${name}'`)

  const ingestion = await updateConfigSection('ingestion', preset.ingestion)
  const rules = await updateConfigSection('rules', preset.rules)

  return { name, ingestion, rules }
}

module.exports = { PRESETS, listPresets, applyPreset }
