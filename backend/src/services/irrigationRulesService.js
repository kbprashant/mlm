'use strict'

const { pool } = require('../config/db')

const RULE_CACHE_TTL_MS = 5000
let cachedRules = []
let lastLoadedAt = 0

const recommendationState = new Map()

async function initIrrigationRules () {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS irrigation_rules (
      id                    SERIAL       PRIMARY KEY,
      name                  VARCHAR(150) NOT NULL,
      enabled               BOOLEAN      NOT NULL DEFAULT TRUE,
      dry_run               BOOLEAN      NOT NULL DEFAULT TRUE,
      priority              INTEGER      NOT NULL DEFAULT 100,
      scope_type            VARCHAR(16)  NOT NULL DEFAULT 'global'
                                         CHECK (scope_type IN ('global', 'tenant', 'site', 'device')),
      tenant_id             INTEGER      REFERENCES tenants(id) ON DELETE CASCADE,
      site_id               INTEGER      REFERENCES sites(id) ON DELETE CASCADE,
      device_id             VARCHAR(50)  REFERENCES devices(id) ON DELETE CASCADE,
      trigger_below_weight  FLOAT        NOT NULL,
      stop_above_weight     FLOAT,
      hysteresis            FLOAT        NOT NULL DEFAULT 0,
      created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `)
}

async function loadRules (force = false) {
  if (!force && Date.now() - lastLoadedAt < RULE_CACHE_TTL_MS && cachedRules.length > 0) {
    return cachedRules
  }

  const result = await pool.query(
    `SELECT * FROM irrigation_rules
     WHERE enabled = true
     ORDER BY priority ASC, id ASC`
  )

  cachedRules = result.rows
  lastLoadedAt = Date.now()
  return cachedRules
}

function matchesScope (rule, deviceContext) {
  if (rule.scope_type === 'global') return true
  if (rule.scope_type === 'tenant') return Number(rule.tenant_id) === Number(deviceContext.tenant_id)
  if (rule.scope_type === 'site') return Number(rule.site_id) === Number(deviceContext.site_id)
  if (rule.scope_type === 'device') return String(rule.device_id) === String(deviceContext.device_id)
  return false
}

function pickApplicableRule (rules, deviceContext) {
  return rules.find((rule) => matchesScope(rule, deviceContext)) || null
}

async function evaluateRulesForReading (deviceContext, prev, current) {
  if (!current || !Number.isFinite(current.weight)) return null

  const rules = await loadRules(false)
  const rule = pickApplicableRule(rules, deviceContext)
  if (!rule) return null

  const startThreshold = Number(rule.trigger_below_weight)
  const stopThreshold = Number.isFinite(Number(rule.stop_above_weight))
    ? Number(rule.stop_above_weight)
    : Number(rule.trigger_below_weight) + Number(rule.hysteresis || 0)

  const key = String(deviceContext.device_id)
  const previousRecommendation = recommendationState.get(key) || null
  let nextRecommendation = previousRecommendation

  if (current.weight <= startThreshold) nextRecommendation = 'ON'
  else if (current.weight >= stopThreshold) nextRecommendation = 'OFF'

  if (!nextRecommendation || nextRecommendation === previousRecommendation) return null

  recommendationState.set(key, nextRecommendation)

  return {
    rule,
    recommended_state: nextRecommendation,
    dry_run: Boolean(rule.dry_run),
    reason: `weight=${current.weight} start<=${startThreshold} stop>=${stopThreshold}`,
    previous_weight: prev?.weight ?? null,
    current_weight: current.weight
  }
}

function invalidateRulesCache () {
  lastLoadedAt = 0
}

module.exports = {
  initIrrigationRules,
  evaluateRulesForReading,
  invalidateRulesCache
}
