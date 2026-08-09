const express = require('express');
const pool = require('./db');
const { adminAuth } = require('./adminAuth');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();
router.use(adminAuth);

// ---------------------------------------------------------------------------
// GET /api/admin/registrations/event/:eventId
// Punkt 53: adminile mängijate nimekiri
// ---------------------------------------------------------------------------
router.get('/event/:eventId', asyncHandler(async (req, res) => {
    const { status } = req.query;
    const params = [req.params.eventId];
    let query = `
        SELECT r.id, r.status, r.registered_at, r.confirmed_at,
               p.id AS player_id, p.player_number, p.first_name, p.last_name, p.email, p.phone,
               d.name AS division_name
        FROM registrations r
        JOIN players p ON p.id = r.player_id
        JOIN divisions d ON d.id = r.division_id
        WHERE r.event_id = $1
    `;
    if (status) {
        params.push(status);
        query += ` AND r.status = $2`;
    }
    query += ' ORDER BY r.registered_at';

    const { rows } = await pool.query(query, params);
    res.json({ registrations: rows });
}));

// ---------------------------------------------------------------------------
// PATCH /api/admin/registrations/:id
// Punkt 66C: admin kinnitab REGISTERED -> CONFIRMED kui näeb makset,
// või määrab DNS/DNF/WAITLIST/REMOVED
// ---------------------------------------------------------------------------
router.patch('/:id', asyncHandler(async (req, res) => {
    const { status, divisionId } = req.body;
    const validStatuses = ['registered', 'confirmed', 'waitlist', 'dns', 'dnf', 'removed'];
    if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: `status peab olema \u00fcks: ${validStatuses.join(', ')}` });
    }

    const setConfirmed = status === 'confirmed';

    const { rows } = await pool.query(
        `UPDATE registrations SET
            status = COALESCE($1, status),
            division_id = COALESCE($2, division_id),
            confirmed_at = CASE WHEN $3 THEN now() ELSE confirmed_at END,
            confirmed_by_admin_id = CASE WHEN $3 THEN $4 ELSE confirmed_by_admin_id END
         WHERE id = $5
         RETURNING *`,
        [status, divisionId, setConfirmed, req.admin.id, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Registreerimist ei leitud.' });
    res.json({ registration: rows[0] });
}));

// ---------------------------------------------------------------------------
// POST /api/admin/registrations/add-player
// Punkt 66E: admin lisab mängija, kellel pole veel kontot
// ---------------------------------------------------------------------------
router.post('/add-player', asyncHandler(async (req, res) => {
    const { eventId, divisionId, firstName, lastName, pdgaNumber, country } = req.body;
    if (!eventId || !divisionId || !firstName || !lastName) {
        return res.status(400).json({ error: 'eventId, divisionId, firstName ja lastName on kohustuslikud.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: playerRows } = await client.query(
            `INSERT INTO players (player_number, first_name, last_name, pdga_number, country, is_claimed)
             VALUES (nextval('player_number_seq'), $1, $2, $3, $4, FALSE)
             RETURNING *`,
            [firstName, lastName, pdgaNumber || null, country || null]
        );
        const player = playerRows[0];

        const { rows: regRows } = await client.query(
            `INSERT INTO registrations (event_id, player_id, division_id, status, pin_confirmed)
             VALUES ($1, $2, $3, 'confirmed', FALSE)
             RETURNING *`,
            [eventId, player.id, divisionId]
        );

        await client.query('COMMIT');
        res.status(201).json({ player, registration: regRows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

module.exports = router;
