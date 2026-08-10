const express = require('express');
const pool = require('./db');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/announcements/:eventId/latest
// Avalik - scorecard poolt polli't, et näidata admini kiirteadet.
// ---------------------------------------------------------------------------
router.get('/:eventId/latest', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT id, message, created_at FROM announcements
         WHERE event_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [req.params.eventId]
    );
    res.json({ announcement: rows[0] || null });
}));

module.exports = router;
