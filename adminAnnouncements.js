const express = require('express');
const pool = require('./db');
const { adminAuth } = require('./adminAuth');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();
router.use(adminAuth);

// ---------------------------------------------------------------------------
// POST /api/admin/announcements/:eventId
// Saadab kiirteate kõigile, kes hetkel selle event'i scorecard'il on
// (nt "Ring peatatud äikese tõttu", "Autasustamine on 18:00").
// ---------------------------------------------------------------------------
router.post('/:eventId', asyncHandler(async (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Teate tekst on kohustuslik.' });
    }
    const { rows } = await pool.query(
        `INSERT INTO announcements (event_id, message, created_by_admin_id)
         VALUES ($1, $2, $3) RETURNING *`,
        [req.params.eventId, message.trim(), req.admin.id]
    );
    res.status(201).json({ announcement: rows[0] });
}));

// ---------------------------------------------------------------------------
// GET /api/admin/announcements/:eventId
// Ajalugu adminile - näeb, mis on varem saadetud.
// ---------------------------------------------------------------------------
router.get('/:eventId', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT * FROM announcements WHERE event_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [req.params.eventId]
    );
    res.json({ announcements: rows });
}));

module.exports = router;
