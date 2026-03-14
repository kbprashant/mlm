'use strict'
const express = require('express')
const { body, validationResult } = require('express-validator')
const { pool } = require('../config/db')
const { requireAuth, requireAdmin } = require('../middleware/auth')

const router = express.Router()

router.get('/', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tenants ORDER BY name ASC')
    res.json(result.rows)
  } catch (error) {
    console.error('[tenants] GET / error:', error.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/',
  requireAdmin,
  body('code').isString().matches(/^[a-z0-9_-]{2,50}$/),
  body('name').isString().isLength({ min: 2, max: 150 }).trim(),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    const { code, name } = req.body

    try {
      const result = await pool.query(
        'INSERT INTO tenants (code, name) VALUES ($1,$2) RETURNING *',
        [code, name]
      )
      res.status(201).json(result.rows[0])
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Tenant code already exists' })
      console.error('[tenants] POST / error:', error.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

router.patch('/:id',
  requireAdmin,
  body('name').optional().isString().isLength({ min: 2, max: 150 }).trim(),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    if (req.body.name === undefined) {
      return res.status(400).json({ error: 'No updatable fields provided' })
    }

    try {
      const result = await pool.query('UPDATE tenants SET name = $2 WHERE id = $1 RETURNING *', [req.params.id, req.body.name])
      if (result.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' })
      res.json(result.rows[0])
    } catch (error) {
      console.error('[tenants] PATCH error:', error.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM tenants WHERE id = $1 RETURNING id', [req.params.id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' })
    res.json({ message: 'Tenant deleted', id: Number(req.params.id) })
  } catch (error) {
    console.error('[tenants] DELETE error:', error.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
