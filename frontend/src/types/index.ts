// ── Domain types ──────────────────────────────────────────────

export interface Device {
  id: string
  name: string
  description: string
  logging_enabled: boolean
  weight_loss_threshold: number
  tenant_id?: number | null
  site_id?: number | null
  control_locked?: boolean
  max_irrigation_on_seconds?: number
  created_at: string
  updated_at: string
  live: LiveDeviceData | null
}

export interface LiveDeviceData {
  device_id: string
  weight: number
  irrigation_status: 'ON' | 'OFF'
  online: boolean
  last_seen: string
}

export interface DataPoint {
  time: string
  weight: number
  irrigation_status: string
}

export interface DeviceEvent {
  id: number
  device_id: string
  event_type: string
  message: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface User {
  id: number
  username: string
  role: 'admin' | 'viewer'
}

export interface Tenant {
  id: number
  code: string
  name: string
  created_at: string
}

export interface Site {
  id: number
  tenant_id: number
  code: string
  name: string
  timezone: string
  tenant_name?: string
  tenant_code?: string
  created_at: string
}

export interface IrrigationRule {
  id: number
  name: string
  enabled: boolean
  dry_run: boolean
  priority: number
  scope_type: 'global' | 'tenant' | 'site' | 'device'
  tenant_id: number | null
  site_id: number | null
  device_id: string | null
  trigger_below_weight: number
  stop_above_weight: number | null
  hysteresis: number
  created_at: string
  updated_at: string
}

export interface IngestionConfig {
  data_topic_pattern: string
  status_topic_pattern: string
  ack_topic_pattern: string
  data_subscribe_topic: string
  status_subscribe_topic: string
  ack_subscribe_topic: string
  command_topic_template: string
  device_id_source: 'topic' | 'payload'
  device_id_topic_index: number
  payload_format: 'json' | 'number'
  device_id_field: string
  weight_field: string
  irrigation_status_field: string
  timestamp_field: string
  static_irrigation_status: string
  ack_id_field: string
}

export interface RulesConfig {
  offline_timeout_ms: number
  broadcast_interval_ms: number
  default_weight_loss_threshold: number
  command_require_ack: boolean
  command_ack_timeout_ms: number
  command_retry_interval_ms: number
  command_max_retries: number
}

export interface PlatformConfig {
  ingestion: IngestionConfig
  rules: RulesConfig
}

export interface CommandQueueItem {
  id: number
  device_id: string
  command_type: string
  payload: Record<string, unknown>
  requested_by: string
  status: 'pending' | 'sent' | 'acked' | 'failed' | 'cancelled'
  attempts: number
  max_attempts: number
  correlation_id: string
  next_attempt_at: string
  sent_at: string | null
  acked_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface LegacyMlmStatus {
  is_active: boolean
  is_weight_maintained: boolean
  is_weight_over: boolean
  is_weight_under: boolean
  wt_diff_gms: number | null
  time: string | null
  last_time: string | null
  wt: number | null
  target_weight_live: number | null
  current_fc_percent: number | null
  diff_fc_percent: number | null
  bg_color: 'disabled' | 'ok' | 'inactive' | 'overweight' | 'emptyoverweight' | 'underweight'
}

export interface LegacyMlm {
  id: string
  site: string
  column: string
  row: number | null
  pot_id: string
  short_description: string
  details: string
  created_on: string
  modified_on: string
  fc100_weight: number
  fc0_weight: number
  target_weight: number
  override_treatment: boolean
  is_enabled: boolean
  treatment_id: string
  treatment_description: string
  target_fc_percent: number | null
  is_dry_down: boolean
  variety_id: string
  variety_description: string
  experiment_id: string
  experiment_description: string
  status: LegacyMlmStatus
}

export interface LegacyMlmHistoryPoint {
  time: string
  weight: number | null
  target_weight: number | null
  diff: number | null
}

// ── WebSocket message envelope ────────────────────────────────

export type WsMessageType = 'auth_ok' | 'auth_error' | 'devices_batch' | 'event'

export interface WsDevicesBatch {
  type: 'devices_batch'
  timestamp: number
  devices: LiveDeviceData[]
}

export interface WsEvent {
  type: 'event'
  data: DeviceEvent
}

export interface WsAuthOk {
  type: 'auth_ok'
  user: User
}

export type WsMessage = WsDevicesBatch | WsEvent | WsAuthOk | { type: string }

// ── UI helpers ───────────────────────────────────────────────

export type TimeRange = '10m' | '1h' | '24h' | '7d' | 'custom'

export type EventFilterType =
  | 'irrigation_on' | 'irrigation_off'
  | 'device_online' | 'device_offline'
  | 'threshold_reached'
  | 'calibration_start' | 'calibration_complete'
  | 'logging_changed' | 'device_registered'
  | 'tare_command' | 'calibrate_command'
  | 'rule_recommendation_on' | 'rule_recommendation_off'
  | 'command_queued' | 'command_sent' | 'command_ack' | 'command_failed' | 'command_retry_scheduled'
  | 'irrigation_safety_cutoff'
