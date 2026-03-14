'use strict'
const express = require('express')
const { body, query, validationResult } = require('express-validator')
const { pool } = require('../config/db')
const { requireAuth, requireAdmin } = require('../middleware/auth')
const { invalidateRulesCache } = require('../services/irrigationRulesService')

const router = express.Router()

router.get('/',
  requireAuth,
  query('scope_type').optional().isIn(['global', 'tenant', 'site', 'device']),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    try {
      if (req.query.scope_type) {
        const result = await pool.query(
          'SELECT * FROM irrigation_rules WHERE scope_type = $1 ORDER BY priority ASC, id ASC',
          [req.query.scope_type]
        )
        return res.json(result.rows)
      }

      const result = await pool.query('SELECT * FROM irrigation_rules ORDER BY priority ASC, id ASC')
      res.json(result.rows)
    } catch (error) {
      console.error('[rules] GET / error:', error.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

router.post('/',
  requireAdmin,
  body('name').isString().isLength({ min: 2, max: 150 }).trim(),
  body('enabled').optional().isBoolean(),
  body('dry_run').optional().isBoolean(),
  body('priority').optional().isInt({ min: 1, max: 10000 }),
  body('scope_type').isIn(['global', 'tenant', 'site', 'device']),
  body('tenant_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('site_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('device_id').optional({ nullable: true }).isString().matches(/^[A-Za-z0-9_-]{1,50}$/),
  body('trigger_below_weight').isFloat(),
  body('stop_above_weight').optional({ nullable: true }).isFloat(),
  body('hysteresis').optional().isFloat({ min: 0 }),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    const {
      name,
      enabled = true,
      dry_run = true,
      priority = 100,
      scope_type,
      tenant_id = null,
      site_id = null,
      device_id = null,
      trigger_below_weight,
      stop_above_weight = null,
      hysteresis = 0
    } = req.body

    if (scope_type === 'tenant' && !tenant_id) return res.status(400).json({ error: 'tenant_id is required for tenant scope' })
    if (scope_type === 'site' && !site_id) return res.status(400).json({ error: 'site_id is required for site scope' })
    if (scope_type === 'device' && !device_id) return res.status(400).json({ error: 'device_id is required for device scope' })

    try {
      const result = await pool.query(
        `INSERT INTO irrigation_rules
         (name, enabled, dry_run, priority, scope_type, tenant_id, site_id, device_id, trigger_below_weight, stop_above_weight, hysteresis)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [name, enabled, dry_run, priority, scope_type, tenant_id, site_id, device_id, trigger_below_weight, stop_above_weight, hysteresis]
      )
      invalidateRulesCache()
      res.status(201).json(result.rows[0])
    } catch (error) {
      console.error('[rules] POST / error:', error.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

router.patch('/:id',
  requireAdmin,
  body('name').optional().isString().isLength({ min: 2, max: 150 }).trim(),
  body('enabled').optional().isBoolean(),
  body('dry_run').optional().isBoolean(),
  body('priority').optional().isInt({ min: 1, max: 10000 }),
  body('trigger_below_weight').optional().isFloat(),
  body('stop_above_weight').optional({ nullable: true }).isFloat(),
  body('hysteresis').optional().isFloat({ min: 0 }),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    const allowed = ['name', 'enabled', 'dry_run', 'priority', 'trigger_below_weight', 'stop_above_weight', 'hysteresis']
    const fields = {}
    for (const key of allowed) {
      if (req.body[key] !== undefined) fields[key] = req.body[key]
    }

    if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No updatable fields provided' })

    const setClauses = Object.keys(fields).map((k, i) => `${k} = $${i + 2}`)
    try {
      const result = await pool.query(
        `UPDATE irrigation_rules SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [req.params.id, ...Object.values(fields)]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' })
      invalidateRulesCache()
      res.json(result.rows[0])
    } catch (error) {
      console.error('[rules] PATCH error:', error.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM irrigation_rules WHERE id = $1 RETURNING id', [req.params.id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' })
    invalidateRulesCache()
    res.json({ message: 'Rule deleted', id: Number(req.params.id) })
  } catch (error) {
    console.error('[rules] DELETE error:', error.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
