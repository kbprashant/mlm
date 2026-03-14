'use strict'

const { pool } = require('../config/db')
const { influx } = require('../config/influx')

const ACTIVE_WINDOW_MS = 10 * 60 * 1000
const ALLOWED_RANGES = new Set(['10m', '1h', '24h', '7d'])

function isValidLegacyId (id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,50}$/.test(id)
}

function escapeInfluxValue (value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function buildTimeFilter (range, from, to) {
  if (from && to) {
    const fromMs = Date.parse(from)
    const toMs = Date.parse(to)
    if (Number.isNaN(fromMs) || Number.isNaN(toMs) || fromMs >= toMs) return null
    return `time >= '${new Date(fromMs).toISOString()}' AND time <= '${new Date(toMs).toISOString()}'`
  }

  const safeRange = ALLOWED_RANGES.has(range) ? range : '24h'
  return `time > now() - ${safeRange}`
}

function buildLegacyStatus (mlm, reading) {
  const fcSpan = mlm.fc100_weight - mlm.fc0_weight
  const weight = reading?.w != null ? Number(reading.w) : null
  const targetWeight = reading?.tw != null ? Number(reading.tw) : Number(mlm.target_weight)
  const lastTime = reading?.time ?? null
  const timeMs = lastTime ? Date.parse(lastTime) : Number.NaN
  const isActive = Number.isFinite(timeMs) && Date.now() - timeMs < ACTIVE_WINDOW_MS
  const weightDiff = weight != null && targetWeight != null ? weight - targetWeight : null
  const currentFcPercent = weight != null && fcSpan !== 0 ? 100 * (weight - mlm.fc0_weight) / fcSpan : null
  const diffFcPercent = weightDiff != null && fcSpan !== 0 ? 100 * weightDiff / fcSpan : null

  const isWeightMaintained = weightDiff != null && weightDiff <= 0.03 && weightDiff >= -0.13
  const isWeightOver = weightDiff != null && weightDiff > 0.03
  const isWeightUnder = weightDiff != null && weightDiff < -0.13

  let bgColor = 'disabled'
  if (mlm.is_enabled) {
    if (isActive && isWeightMaintained) bgColor = 'ok'
    else if (isActive) {
      if (isWeightOver) bgColor = mlm.variety_id === 'EMPTY' ? 'emptyoverweight' : 'overweight'
      else bgColor = 'underweight'
    } else {
      bgColor = 'inactive'
    }
  }

  return {
    is_active: Boolean(isActive),
    is_weight_maintained: Boolean(isWeightMaintained),
    is_weight_over: Boolean(isWeightOver),
    is_weight_under: Boolean(isWeightUnder),
    wt_diff_gms: weightDiff,
    time: lastTime,
    last_time: lastTime,
    wt: weight,
    target_weight_live: targetWeight,
    current_fc_percent: currentFcPercent,
    diff_fc_percent: diffFcPercent,
    bg_color: bgColor,
  }
}

function mapLegacyMlm (row, reading) {
  const status = buildLegacyStatus(row, reading)

  return {
    id: row.id,
    site: row.id?.[0] ?? '',
    column: row.id?.[1] ?? '',
    row: Number.parseInt(String(row.id).slice(2), 10) || null,
    pot_id: row.pot_id,
    short_description: row.short_description,
    details: row.details,
    created_on: row.created_on,
    modified_on: row.modified_on,
    fc100_weight: Number(row.fc100_weight),
    fc0_weight: Number(row.fc0_weight),
    target_weight: Number(row.target_weight),
    override_treatment: row.override_treatment,
    is_enabled: row.is_enabled,
    treatment_id: row.treatment_id,
    treatment_description: row.treatment_description,
    target_fc_percent: row.target_fc_percent != null ? Number(row.target_fc_percent) : null,
    is_dry_down: row.is_dry_down,
    variety_id: row.variety_id,
    variety_description: row.variety_description,
    experiment_id: row.experiment_id,
    experiment_description: row.experiment_description,
    status,
  }
}

async function getLatestFcReadings (ids) {
  const validIds = ids.filter(isValidLegacyId)
  if (validIds.length === 0) return new Map()

  const readings = new Map()
  const chunkSize = 120

  for (let start = 0; start < validIds.length; start += chunkSize) {
    const chunk = validIds.slice(start, start + chunkSize)
    const filter = chunk.map((id) => `"id" = '${escapeInfluxValue(id)}'`).join(' OR ')
    const rows = await influx.query(
      `SELECT LAST("w") AS "w", LAST("tw") AS "tw" FROM "fc" WHERE ${filter} GROUP BY "id"`
    )

    for (const row of rows) {
      if (row.id) readings.set(row.id, row)
    }
  }

  return readings
}

async function queryLegacyRows (site, id) {
  const conditions = []
  const values = []

  if (site) {
    values.push(`${site.toUpperCase()}%`)
    conditions.push(`m.id LIKE $${values.length}`)
  }

  if (id) {
    values.push(id)
    conditions.push(`m.id = $${values.length}`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const sql = `
    SELECT
      m.id,
      m.pot_id,
      m.short_description,
      m.details,
      m.created_on,
      m.modified_on,
      m."FC100_weight" AS fc100_weight,
      m."FC0_weight" AS fc0_weight,
      m.target_weight,
      m.override_treatment,
      m.is_enabled,
      t.id AS treatment_id,
      t.short_description AS treatment_description,
      t.target_FC_percent AS target_fc_percent,
      t.is_dry_down,
      v.id AS variety_id,
      v.short_description AS variety_description,
      e.id AS experiment_id,
      e.short_description AS experiment_description
    FROM mlm_mlm m
    JOIN mlm_treatment t ON t.id = m.treatment_id
    JOIN mlm_variety v ON v.id = m.variety_id
    JOIN mlm_experiment e ON e.id = m.experiment_id
    ${where}
    ORDER BY m.id ASC
  `

  try {
    const result = await pool.query(sql, values)
    return result.rows
  } catch (error) {
    if (error.code === '42P01') return []
    throw error
  }
}

async function getLegacyMlms (site) {
  const rows = await queryLegacyRows(site, null)
  const readings = await getLatestFcReadings(rows.map((row) => row.id))
  return rows.map((row) => mapLegacyMlm(row, readings.get(row.id)))
}

async function getLegacyMlm (id) {
  if (!isValidLegacyId(id)) return null
  const rows = await queryLegacyRows(null, id)
  if (rows.length === 0) return null
  const readings = await getLatestFcReadings([id])
  return mapLegacyMlm(rows[0], readings.get(id))
}

async function getLegacyMlmHistory (id, range, from, to) {
  if (!isValidLegacyId(id)) return null
  const timeFilter = buildTimeFilter(range, from, to)
  if (!timeFilter) return undefined

  try {
    const rows = await influx.query(
      `SELECT "w" AS "weight", "tw" AS "target_weight"
       FROM "fc"
       WHERE "id" = '${escapeInfluxValue(id)}' AND ${timeFilter}
       ORDER BY time ASC
       LIMIT 10000`
    )

    return rows.map((row) => ({
      time: row.time,
      weight: row.weight != null ? Number(row.weight) : null,
      target_weight: row.target_weight != null ? Number(row.target_weight) : null,
      diff: row.weight != null && row.target_weight != null ? Number(row.weight) - Number(row.target_weight) : null,
    }))
  } catch (error) {
    if (error.message && /measurement/i.test(error.message)) return []
    throw error
  }
}

module.exports = {
  getLegacyMlms,
  getLegacyMlm,
  getLegacyMlmHistory,
}