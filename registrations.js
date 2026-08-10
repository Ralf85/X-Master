const express = require('express');
const pool = require('./db');
const playerAuth = require('./playerAuth');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();
router.use(playerAuth);

// ---------------------------------------------------------------------------
// POST /api/registrations/:eventId
// Registreerimine - mängija on juba sisselogimisega autenditud, PIN-i
// uuesti ei küsita (see nõue eemaldati).
// ---------------------------------------------------------------------------
router.post('/:eventId', asyncHandler(async (req, res) => {
    const { divisionId } = req.body;
    if (!divisionId) {
        return res.status(400).json({ error: 'divisionId on kohustuslik.' });
    }

    const { rows: eventRows } = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.eventId]);
    const event = eventRows[0];
    if (!event) return res.status(404).json({ error: 'Võistlust ei leitud.' });
    if (event.status !== 'registration_open') {
        return res.status(400).json({ error: 'Registreerimine ei ole hetkel avatud.' });
    }
    if (event.registration_end && new Date() > new Date(event.registration_end)) {
        return res.status(400).json({ error: 'Registreerimise tähtaeg on möödas.' });
    }

    if (event.registration_limit) {
        const { rows: countRows } = await pool.query(
            `SELECT count(*) FROM registrations WHERE event_id = $1 AND status IN ('registered', 'confirmed')`,
            [req.params.eventId]
        );
        if (parseInt(countRows[0].count, 10) >= event.registration_limit) {
            return res.status(400).json({ error: 'Võistlus on täis.' });
        }
    }

    const { rows } = await pool.query(
        `INSERT INTO registrations (event_id, player_id, division_id, status, pin_confirmed)
         VALUES ($1, $2, $3, 'registered', TRUE)
         RETURNING *`,
        [req.params.eventId, req.player.id, divisionId]
    );

    res.status(201).json({ registration: rows[0] });
}));

// ---------------------------------------------------------------------------
// GET /api/registrations
// Punkt 11: mängija enda tulevased/toimunud võistlused
// ---------------------------------------------------------------------------
router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT r.id, r.status, r.registered_at, r.confirmed_at,
                e.id AS event_id, e.name AS event_name, e.slug, e.start_date, e.end_date, e.status AS event_status,
                d.name AS division_name
         FROM registrations r
         JOIN events e ON e.id = r.event_id
         JOIN divisions d ON d.id = r.division_id
         WHERE r.player_id = $1
         ORDER BY e.start_date DESC`,
        [req.player.id]
    );
    res.json({ registrations: rows });
}));

module.exports = router;
