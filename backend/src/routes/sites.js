'use strict'
const express = require('express')
const { body, query, validationResult } = require('express-validator')
const { pool } = require('../config/db')
const { requireAuth, requireAdmin } = require('../middleware/auth')

const router = express.Router()

router.get('/',
  requireAuth,
  query('tenant_id').optional().isInt({ min: 1 }),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    try {
      if (req.query.tenant_id) {
        const result = await pool.query(
          `SELECT s.*, t.name AS tenant_name, t.code AS tenant_code
           FROM sites s
           JOIN tenants t ON t.id = s.tenant_id
           WHERE s.tenant_id = $1
           ORDER BY s.name ASC`,
          [req.query.tenant_id]
        )
        return res.json(result.rows)
      }

      const result = await pool.query(
        `SELECT s.*, t.name AS tenant_name, t.code AS tenant_code
         FROM sites s
         JOIN tenants t ON t.id = s.tenant_id
         ORDER BY t.name ASC, s.name ASC`
      )
      res.json(result.rows)
    } catch (error) {
      console.error('[sites] GET / error:', error.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

router.post('/',
  requireAdmin,
  body('tenant_id').isInt({ min: 1 }),
  body('code').isString().matches(/^[a-z0-9_-]{2,50}$/),
  body('name').isString().isLength({ min: 2, max: 150 }).trim(),
  body('timezone').optional().isString().isLength({ min: 2, max: 100 }),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    const { tenant_id, code, name, timezone = 'UTC' } = req.body

    try {
      const tenant = await pool.query('SELECT id FROM tenants WHERE id = $1', [tenant_id])
      if (tenant.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' })

      const result = await pool.query(
        'INSERT INTO sites (tenant_id, code, name, timezone) VALUES ($1,$2,$3,$4) RETURNING *',
        [tenant_id, code, name, timezone]
      )
      res.status(201).json(result.rows[0])
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Site code already exists for tenant' })
      console.error('[sites] POST / error:', error.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

router.patch('/:id',
  requireAdmin,
  body('name').optional().isString().isLength({ min: 2, max: 150 }).trim(),
  body('timezone').optional().isString().isLength({ min: 2, max: 100 }),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    const fields = {}
    if (req.body.name !== undefined) fields.name = req.body.name
    if (req.body.timezone !== undefined) fields.timezone = req.body.timezone
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' })
    }

    const setClauses = Object.keys(fields).map((k, i) => `${k} = $${i + 2}`)
    try {
      const result = await pool.query(
        `UPDATE sites SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
        [req.params.id, ...Object.values(fields)]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Site not found' })
      res.json(result.rows[0])
    } catch (error) {
      console.error('[sites] PATCH error:', error.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM sites WHERE id = $1 RETURNING id', [req.params.id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'Site not found' })
    res.json({ message: 'Site deleted', id: Number(req.params.id) })
  } catch (error) {
    console.error('[sites] DELETE error:', error.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
