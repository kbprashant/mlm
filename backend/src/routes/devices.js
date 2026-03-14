'use strict'
const express  = require('express')
const { body, validationResult } = require('express-validator')
const { pool } = require('../config/db')
const { getAllDevices, getDevice } = require('../services/deviceStore')
const { requireAuth, requireAdmin } = require('../middleware/auth')

const router = express.Router()

// GET /api/devices
router.get('/', requireAuth, async (_req, res) => {
  try {
    const result  = await pool.query('SELECT * FROM devices ORDER BY id')
    const liveMap = new Map(getAllDevices().map((d) => [d.device_id, d]))
    res.json(result.rows.map((d) => ({ ...d, live: liveMap.get(d.id) || null })))
  } catch (err) {
    console.error('[devices] GET / error:', err.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/devices
router.post('/',
  requireAdmin,
  body('id').isString().matches(/^[A-Za-z0-9_-]{1,50}$/).trim(),
  body('name').isString().isLength({ max: 100 }).trim(),
  body('description').optional().isString().trim(),
  body('weight_loss_threshold').optional().isFloat({ min: 0 }),
  body('tenant_id').optional().isInt({ min: 1 }),
  body('site_id').optional().isInt({ min: 1 }),
  body('control_locked').optional().isBoolean(),
  body('max_irrigation_on_seconds').optional().isInt({ min: 10, max: 86400 }),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    const {
      id,
      name,
      description = '',
      weight_loss_threshold = 50.0,
      tenant_id,
      site_id,
      control_locked = false,
      max_irrigation_on_seconds = 900
    } = req.body
    try {
      if (site_id !== undefined && tenant_id === undefined) {
        return res.status(400).json({ error: 'tenant_id is required when site_id is provided' })
      }

      if (tenant_id !== undefined) {
        const tenantCheck = await pool.query('SELECT id FROM tenants WHERE id = $1', [tenant_id])
        if (tenantCheck.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' })
      }

      if (site_id !== undefined) {
        const siteCheck = await pool.query('SELECT tenant_id FROM sites WHERE id = $1', [site_id])
        if (siteCheck.rows.length === 0) return res.status(404).json({ error: 'Site not found' })
        if (tenant_id !== undefined && Number(siteCheck.rows[0].tenant_id) !== Number(tenant_id)) {
          return res.status(400).json({ error: 'site_id does not belong to tenant_id' })
        }
      }

      const result = await pool.query(
        'INSERT INTO devices (id,name,description,weight_loss_threshold,tenant_id,site_id,control_locked,max_irrigation_on_seconds) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [id, name, description, weight_loss_threshold, tenant_id || null, site_id || null, control_locked, max_irrigation_on_seconds]
      )
      res.status(201).json(result.rows[0])
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Device ID already exists' })
      console.error('[devices] POST / error:', err.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// GET /api/devices/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM devices WHERE id = $1', [req.params.id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'Device not found' })
    res.json({ ...result.rows[0], live: getDevice(req.params.id) })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/devices/:id
router.patch('/:id',
  requireAdmin,
  body('name').optional().isString().isLength({ max: 100 }).trim(),
  body('description').optional().isString().trim(),
  body('logging_enabled').optional().isBoolean(),
  body('weight_loss_threshold').optional().isFloat({ min: 0 }),
  body('tenant_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('site_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('control_locked').optional().isBoolean(),
  body('max_irrigation_on_seconds').optional().isInt({ min: 10, max: 86400 }),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    const { id } = req.params
    const ALLOWED = ['name', 'description', 'logging_enabled', 'weight_loss_threshold', 'tenant_id', 'site_id', 'control_locked', 'max_irrigation_on_seconds']
    const fields  = {}
    for (const k of ALLOWED) {
      if (req.body[k] !== undefined) fields[k] = req.body[k]
    }
    if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No updatable fields provided' })

    const setClauses = Object.keys(fields).map((k, i) => `${k} = $${i + 2}`)
    try {
      if (fields.tenant_id !== undefined && fields.tenant_id !== null) {
        const tenantCheck = await pool.query('SELECT id FROM tenants WHERE id = $1', [fields.tenant_id])
        if (tenantCheck.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' })
      }

      if (fields.site_id !== undefined && fields.site_id !== null) {
        const siteCheck = await pool.query('SELECT tenant_id FROM sites WHERE id = $1', [fields.site_id])
        if (siteCheck.rows.length === 0) return res.status(404).json({ error: 'Site not found' })
        let tenantForCheck = null
        if (fields.tenant_id !== undefined) {
          tenantForCheck = fields.tenant_id
        } else {
          const currentDevice = await pool.query('SELECT tenant_id FROM devices WHERE id = $1', [id])
          if (currentDevice.rows.length === 0) return res.status(404).json({ error: 'Device not found' })
          tenantForCheck = currentDevice.rows[0].tenant_id
        }

        if (tenantForCheck === null) {
          return res.status(400).json({ error: 'tenant_id is required before assigning site_id' })
        }

        if (tenantForCheck !== null && Number(siteCheck.rows[0].tenant_id) !== Number(tenantForCheck)) {
          return res.status(400).json({ error: 'site_id does not belong to tenant_id' })
        }
      }

      const result = await pool.query(
        `UPDATE devices SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id, ...Object.values(fields)]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Device not found' })

      if (fields.logging_enabled !== undefined) {
        const status = fields.logging_enabled ? 'enabled' : 'disabled'
        await pool.query(
          'INSERT INTO events (device_id, event_type, message, metadata) VALUES ($1,$2,$3,$4)',
          [id, 'logging_changed', `Data logging ${status} by ${req.user.username}`,
            JSON.stringify({ logging_enabled: fields.logging_enabled, user: req.user.username })]
        )
      }

      res.json(result.rows[0])
    } catch (err) {
      console.error('[devices] PATCH error:', err.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// DELETE /api/devices/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM devices WHERE id = $1 RETURNING id', [req.params.id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'Device not found' })
    res.json({ message: 'Device deleted', id: req.params.id })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
