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
    delete event.guide_file_data; // binaarandmed ei pea event'i JSON-i sisse minema
    delete event.course_map_data;

    const [divisions, parks, rounds, registrations] = await Promise.all([
        pool.query('SELECT id, name, sort_order FROM divisions WHERE event_id = $1 ORDER BY sort_order', [event.id]),
        pool.query('SELECT id, name, color, icon, sponsor, sort_order FROM parks WHERE event_id = $1 ORDER BY sort_order', [event.id]),
        pool.query('SELECT id, round_number, name, round_date, status FROM rounds WHERE event_id = $1 ORDER BY round_number', [event.id]),
        pool.query(
            `SELECT r.id, r.status, p.first_name, p.last_name, p.gender, p.bag_tag_number, d.name AS division_name
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

// ---------------------------------------------------------------------------
// GET /api/events/:id/guide-file
// Avalik - serveerib event'i juhendi dokumendi (PDF/Word/pilt) baite.
// ---------------------------------------------------------------------------
router.get('/:id/guide-file', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        'SELECT guide_file_data, guide_file_mimetype, guide_file_name FROM events WHERE id = $1',
        [req.params.id]
    );
    if (!rows[0] || !rows[0].guide_file_data) return res.status(404).send('Juhendit ei leitud.');
    res.set('Content-Type', rows[0].guide_file_mimetype);
    res.set('Content-Disposition', `inline; filename="${rows[0].guide_file_name || 'juhend'}"`);
    res.send(rows[0].guide_file_data);
}));

// ---------------------------------------------------------------------------
// GET /api/events/:id/course-map
// Avalik - serveerib rajakaardi pildi, AGA ainult siis, kui admin on selle
// AVALIKUKS märkinud. Kui PEIDUS, ei näita seda ka otselingi kaudu.
// ---------------------------------------------------------------------------
router.get('/:id/course-map', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        'SELECT course_map_data, course_map_mimetype, course_map_name, course_map_visible FROM events WHERE id = $1',
        [req.params.id]
    );
    if (!rows[0] || !rows[0].course_map_data || !rows[0].course_map_visible) {
        return res.status(404).send('Rajakaarti ei leitud.');
    }
    res.set('Content-Type', rows[0].course_map_mimetype);
    res.set('Content-Disposition', `inline; filename="${rows[0].course_map_name || 'rajakaart'}"`);
    res.send(rows[0].course_map_data);
}));

module.exports = router;
