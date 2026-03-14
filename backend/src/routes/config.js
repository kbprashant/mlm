'use strict'
const express = require('express')
const { body, validationResult } = require('express-validator')
const { pool } = require('../config/db')
const { requireAuth, requireAdmin } = require('../middleware/auth')
const {
  getAllConfig,
  getConfigSection,
  updateConfigSection
} = require('../services/platformConfigService')
const { listPresets, applyPreset } = require('../services/configPresetsService')
const { invalidateRulesCache } = require('../services/irrigationRulesService')

const router = express.Router()

router.get('/', requireAuth, async (_req, res) => {
  try {
    const all = await getAllConfig()
    res.json(all)
  } catch (error) {
    console.error('[config] GET / error:', error.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/presets/list', requireAuth, async (_req, res) => {
  res.json({ presets: listPresets() })
})

router.post('/presets/:name', requireAdmin, async (req, res) => {
  try {
    const applied = await applyPreset(req.params.name)
    res.json(applied)
  } catch (error) {
    if (error.message.startsWith('Unknown preset')) {
      return res.status(400).json({ error: error.message })
    }
    console.error('[config] apply preset error:', error.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/export/snapshot', requireAdmin, async (_req, res) => {
  try {
    const [config, tenants, sites, rules] = await Promise.all([
      getAllConfig({ fresh: true }),
      pool.query('SELECT code, name FROM tenants ORDER BY id ASC'),
      pool.query(
        `SELECT s.code, s.name, s.timezone, t.code AS tenant_code
         FROM sites s
         JOIN tenants t ON t.id = s.tenant_id
         ORDER BY s.id ASC`
      ),
      pool.query(
        `SELECT
           r.name, r.enabled, r.dry_run, r.priority, r.scope_type,
           r.device_id, r.trigger_below_weight, r.stop_above_weight, r.hysteresis,
           t.code AS tenant_code,
           s.code AS site_code
         FROM irrigation_rules r
         LEFT JOIN tenants t ON t.id = r.tenant_id
         LEFT JOIN sites s ON s.id = r.site_id
         ORDER BY r.priority ASC, r.id ASC`
      )
    ])

    res.json({
      version: 1,
      exported_at: new Date().toISOString(),
      config,
      tenants: tenants.rows,
      sites: sites.rows,
      rules: rules.rows
    })
  } catch (error) {
    console.error('[config] export snapshot error:', error.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/import/snapshot',
  requireAdmin,
  body('config').optional().isObject(),
  body('tenants').optional().isArray(),
  body('sites').optional().isArray(),
  body('rules').optional().isArray(),
  body('replace_rules').optional().isBoolean(),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    const snapshot = req.body || {}
    const client = await pool.connect()
    const tenantIdByCode = new Map()
    const siteIdByKey = new Map()

    try {
      await client.query('BEGIN')

      if (snapshot.config?.ingestion) {
        const currentIngestion = await getConfigSection('ingestion', { fresh: true })
        await client.query(
          `INSERT INTO platform_config (section, config, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (section) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()`,
          ['ingestion', JSON.stringify({ ...currentIngestion, ...snapshot.config.ingestion })]
        )
      }
      if (snapshot.config?.rules) {
        const currentRules = await getConfigSection('rules', { fresh: true })
        await client.query(
          `INSERT INTO platform_config (section, config, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (section) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()`,
          ['rules', JSON.stringify({ ...currentRules, ...snapshot.config.rules })]
        )
      }

      if (Array.isArray(snapshot.tenants)) {
        for (const tenant of snapshot.tenants) {
          if (!tenant?.code || !tenant?.name) continue
          const upserted = await client.query(
            `INSERT INTO tenants (code, name)
             VALUES ($1, $2)
             ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
             RETURNING id, code`,
            [String(tenant.code), String(tenant.name)]
          )
          tenantIdByCode.set(upserted.rows[0].code, upserted.rows[0].id)
        }
      }

      const existingTenants = await client.query('SELECT id, code FROM tenants')
      for (const row of existingTenants.rows) tenantIdByCode.set(row.code, row.id)

      if (Array.isArray(snapshot.sites)) {
        for (const site of snapshot.sites) {
          if (!site?.code || !site?.name || !site?.tenant_code) continue
          const tenantId = tenantIdByCode.get(String(site.tenant_code))
          if (!tenantId) continue
          const upserted = await client.query(
            `INSERT INTO sites (tenant_id, code, name, timezone)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (tenant_id, code)
             DO UPDATE SET name = EXCLUDED.name, timezone = EXCLUDED.timezone
             RETURNING id, code, tenant_id`,
            [tenantId, String(site.code), String(site.name), String(site.timezone || 'UTC')]
          )
          siteIdByKey.set(`${upserted.rows[0].tenant_id}:${upserted.rows[0].code}`, upserted.rows[0].id)
        }
      }

      const existingSites = await client.query('SELECT id, tenant_id, code FROM sites')
      for (const row of existingSites.rows) siteIdByKey.set(`${row.tenant_id}:${row.code}`, row.id)

      if (snapshot.replace_rules === true) {
        await client.query('DELETE FROM irrigation_rules')
      }

      if (Array.isArray(snapshot.rules)) {
        for (const rule of snapshot.rules) {
          if (!rule?.name || !rule?.scope_type || rule.trigger_below_weight === undefined) continue

          const tenantId = rule.tenant_code ? tenantIdByCode.get(String(rule.tenant_code)) || null : null
          const siteId = rule.site_code && tenantId
            ? siteIdByKey.get(`${tenantId}:${String(rule.site_code)}`) || null
            : null

          await client.query(
            `INSERT INTO irrigation_rules
             (name, enabled, dry_run, priority, scope_type, tenant_id, site_id, device_id, trigger_below_weight, stop_above_weight, hysteresis)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              String(rule.name),
              rule.enabled !== false,
              rule.dry_run !== false,
              Number(rule.priority || 100),
              String(rule.scope_type),
              tenantId,
              siteId,
              rule.device_id ? String(rule.device_id) : null,
              Number(rule.trigger_below_weight),
              rule.stop_above_weight !== undefined && rule.stop_above_weight !== null ? Number(rule.stop_above_weight) : null,
              Number(rule.hysteresis || 0)
            ]
          )
        }
      }

      await client.query('COMMIT')
      invalidateRulesCache()
      res.json({ success: true })
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('[config] import snapshot error:', error.message)
      res.status(500).json({ error: 'Import failed: ' + error.message })
    } finally {
      client.release()
    }
  }
)

router.get('/:section', requireAuth, async (req, res) => {
  try {
    const section = await getConfigSection(req.params.section)
    res.json(section)
  } catch (error) {
    if (error.message.startsWith('Invalid config section')) {
      return res.status(400).json({ error: error.message })
    }
    console.error('[config] GET section error:', error.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/ingestion',
  requireAdmin,
  body('data_topic_pattern').optional().isString().isLength({ min: 1, max: 255 }),
  body('status_topic_pattern').optional().isString().isLength({ min: 1, max: 255 }),
  body('data_subscribe_topic').optional().isString().isLength({ min: 1, max: 255 }),
  body('status_subscribe_topic').optional().isString().isLength({ min: 1, max: 255 }),
  body('ack_topic_pattern').optional().isString().isLength({ min: 1, max: 255 }),
  body('ack_subscribe_topic').optional().isString().isLength({ min: 1, max: 255 }),
  body('command_topic_template').optional().isString().isLength({ min: 1, max: 255 }),
  body('device_id_source').optional().isIn(['topic', 'payload']),
  body('device_id_topic_index').optional().isInt({ min: 0, max: 20 }),
  body('payload_format').optional().isIn(['json', 'number']),
  body('device_id_field').optional().isString().isLength({ min: 1, max: 128 }),
  body('weight_field').optional().isString().isLength({ min: 1, max: 128 }),
  body('irrigation_status_field').optional().isString().isLength({ min: 1, max: 128 }),
  body('timestamp_field').optional().isString().isLength({ min: 1, max: 128 }),
  body('static_irrigation_status').optional().isString().isLength({ min: 2, max: 16 }),
  body('ack_id_field').optional().isString().isLength({ min: 1, max: 128 }),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    try {
      const updated = await updateConfigSection('ingestion', req.body)
      res.json(updated)
    } catch (error) {
      console.error('[config] PATCH ingestion error:', error.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

router.patch('/rules',
  requireAdmin,
  body('offline_timeout_ms').optional().isInt({ min: 3000, max: 300000 }),
  body('broadcast_interval_ms').optional().isInt({ min: 250, max: 60000 }),
  body('default_weight_loss_threshold').optional().isFloat({ min: 0 }),
  body('command_require_ack').optional().isBoolean(),
  body('command_ack_timeout_ms').optional().isInt({ min: 1000, max: 300000 }),
  body('command_retry_interval_ms').optional().isInt({ min: 1000, max: 300000 }),
  body('command_max_retries').optional().isInt({ min: 1, max: 20 }),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    try {
      const updated = await updateConfigSection('rules', req.body)
      res.json(updated)
    } catch (error) {
      console.error('[config] PATCH rules error:', error.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

module.exports = router
