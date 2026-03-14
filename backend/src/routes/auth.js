'use strict'
const express  = require('express')
const bcrypt   = require('bcryptjs')
const jwt      = require('jsonwebtoken')
const { body, validationResult } = require('express-validator')
const { pool } = require('../config/db')
const { requireAdmin } = require('../middleware/auth')

const router = express.Router()

// POST /api/auth/login
router.post('/login',
  body('username').isString().notEmpty().trim(),
  body('password').isString().notEmpty(),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    const { username, password } = req.body
    try {
      const result = await pool.query('SELECT * FROM users WHERE username = $1', [username])
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' })
      }
      const user  = result.rows[0]
      const valid = await bcrypt.compare(password, user.password_hash)
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      )
      res.json({ token, user: { id: user.id, username: user.username, role: user.role } })
    } catch (err) {
      console.error('[auth] login error:', err.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// POST /api/auth/register  (requires existing admin JWT, except very first user)
router.post('/register',
  body('username').isString().isLength({ min: 3, max: 50 }).trim(),
  body('password').isString().isLength({ min: 8 }),
  body('role').isIn(['admin', 'viewer']),
  async (req, res) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() })

    // Allow first user creation without auth; afterwards require admin
    const { rows } = await pool.query('SELECT COUNT(*) FROM users')
    if (parseInt(rows[0].count, 10) > 0) {
      // Reuse requireAdmin as middleware logic
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Admin authentication required' })
      }
      try {
        const payload = require('jsonwebtoken').verify(authHeader.slice(7), process.env.JWT_SECRET)
        if (payload.role !== 'admin') return res.status(403).json({ error: 'Admin access required' })
      } catch {
        return res.status(401).json({ error: 'Invalid token' })
      }
    }

    const { username, password, role } = req.body
    try {
      const hash   = await bcrypt.hash(password, 12)
      const result = await pool.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3) RETURNING id, username, role',
        [username, hash, role]
      )
      res.status(201).json(result.rows[0])
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' })
      console.error('[auth] register error:', err.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

module.exports = router
