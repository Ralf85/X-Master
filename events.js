const express = require('express');
const pool = require('./db');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/events
// Avalik nimekiri (punkt 14) - draft võistlusi ei näidata
// ---------------------------------------------------------------------------
router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT id, name, slug, location, start_date, end_date, status, logo_url
         FROM events
         WHERE status != 'draft'
         ORDER BY start_date DESC`
    );
    res.json({ events: rows });
}));

// ---------------------------------------------------------------------------
// GET /api/events/:slug
// Avalik event'i leht - divisjonid, pargid, ringid (punkt 14-15)
// ---------------------------------------------------------------------------
router.get('/:slug', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT * FROM events WHERE slug = $1 AND status != 'draft'`,
        [req.params.slug]
    );
    const event = rows[0];
    if (!event) return res.status(404).json({ error: 'Võistlust ei leitud.' });

    const [divisions, parks, rounds, registrations] = await Promise.all([
        pool.query('SELECT id, name, sort_order FROM divisions WHERE event_id = $1 ORDER BY sort_order', [event.id]),
        pool.query('SELECT id, name, color, icon, sponsor, sort_order FROM parks WHERE event_id = $1 ORDER BY sort_order', [event.id]),
        pool.query('SELECT id, round_number, name, round_date, status FROM rounds WHERE event_id = $1 ORDER BY round_number', [event.id]),
        pool.query(
            `SELECT r.id, r.status, p.first_name, p.last_name, d.name AS division_name
             FROM registrations r
             JOIN players p ON p.id = r.player_id
             JOIN divisions d ON d.id = r.division_id
             WHERE r.event_id = $1 AND r.status NOT IN ('removed', 'dns')
             ORDER BY p.first_name`,
            [event.id]
        ),
    ]);

    res.json({
        event,
        divisions: divisions.rows,
        parks: parks.rows,
        rounds: rounds.rows,
        registrations: registrations.rows,
    });
}));

module.exports = router;
