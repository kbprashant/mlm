'use strict'

const express = require('express')
const { requireAuth } = require('../middleware/auth')
const {
  getLegacyMlms,
  getLegacyMlm,
  getLegacyMlmHistory,
} = require('../services/legacyMlmService')

const router = express.Router()

router.get('/mlms', requireAuth, async (req, res) => {
  const site = typeof req.query.site === 'string' && /^[A-Za-z]$/.test(req.query.site)
    ? req.query.site.toUpperCase()
    : undefined

  try {
    const mlms = await getLegacyMlms(site)
    res.json({ site: site || null, mlms })
  } catch (error) {
    console.error('[legacy] mlms query error:', error.message)
    res.status(500).json({ error: 'Failed to query legacy MLM data' })
  }
})

router.get('/mlms/:id', requireAuth, async (req, res) => {
  try {
    const mlm = await getLegacyMlm(req.params.id)
    if (!mlm) return res.status(404).json({ error: 'Legacy MLM not found' })
    res.json(mlm)
  } catch (error) {
    console.error('[legacy] mlm detail error:', error.message)
    res.status(500).json({ error: 'Failed to query legacy MLM detail' })
  }
})

router.get('/mlms/:id/history', requireAuth, async (req, res) => {
  try {
    const history = await getLegacyMlmHistory(req.params.id, req.query.range, req.query.from, req.query.to)
    if (history === null) return res.status(400).json({ error: 'Invalid MLM id' })
    if (history === undefined) return res.status(400).json({ error: 'Invalid time range' })
    res.json(history)
  } catch (error) {
    console.error('[legacy] mlm history error:', error.message)
    res.status(500).json({ error: 'Failed to query legacy MLM history' })
  }
})

module.exports = router