const express = require('express');
const pool = require('./db');
const { adminAuth } = require('./adminAuth');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();
router.use(adminAuth);

// ---------------------------------------------------------------------------
// POST /api/admin/pools/rounds/:roundId
// Punkt 54: stardigrupi loomine
// ---------------------------------------------------------------------------
router.post('/rounds/:roundId', asyncHandler(async (req, res) => {
    const { poolNumber, startTime, startHole, requireDoubleVerification, maxPlayers } = req.body;
    if (!poolNumber) return res.status(400).json({ error: 'poolNumber on kohustuslik.' });

    const { rows } = await pool.query(
        `INSERT INTO pools (round_id, pool_number, start_time, start_hole, require_double_verification, max_players)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.params.roundId, poolNumber, startTime || null, startHole || 1, Boolean(requireDoubleVerification), maxPlayers || null]
    );
    res.status(201).json({ pool: rows[0] });
}));

// ---------------------------------------------------------------------------
// GET /api/admin/pools/rounds/:roundId
// Kõik ringi poolid koos mängijatega
// ---------------------------------------------------------------------------
router.get('/rounds/:roundId', asyncHandler(async (req, res) => {
    const { rows: pools } = await pool.query(
        'SELECT * FROM pools WHERE round_id = $1 ORDER BY pool_number', [req.params.roundId]
    );

    const { rows: players } = await pool.query(
        `SELECT pp.pool_id, p.id AS player_id, p.player_number, p.first_name, p.last_name,
                p.profile_image_url, r.division_id
         FROM pool_players pp
         JOIN registrations r ON r.id = pp.registration_id
         JOIN players p ON p.id = r.player_id
         WHERE pp.pool_id = ANY($1::int[])`,
        [pools.map((p) => p.id)]
    );

    const poolsWithPlayers = pools.map((p) => ({
        ...p,
        players: players.filter((pl) => pl.pool_id === p.id),
    }));

    res.json({ pools: poolsWithPlayers });
}));

// ---------------------------------------------------------------------------
// POST /api/admin/pools/:poolId/players
// Punkt 54-55: mängija lisamine pooli (registration_id kaudu)
// ---------------------------------------------------------------------------
router.post('/:poolId/players', asyncHandler(async (req, res) => {
    const { registrationId } = req.body;
    if (!registrationId) return res.status(400).json({ error: 'registrationId on kohustuslik.' });

    const { rows } = await pool.query(
        `INSERT INTO pool_players (pool_id, registration_id) VALUES ($1, $2) RETURNING *`,
        [req.params.poolId, registrationId]
    );
    res.status(201).json({ poolPlayer: rows[0] });
}));

// ---------------------------------------------------------------------------
// DELETE /api/admin/pools/players/:poolPlayerId
// Punkt 54: mängija liigutamine poolist välja (teise poolisse lisamiseks)
// ---------------------------------------------------------------------------
router.delete('/players/:poolPlayerId', asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM pool_players WHERE id = $1', [req.params.poolPlayerId]);
    res.json({ message: 'Mängija eemaldatud poolist.' });
}));

// ---------------------------------------------------------------------------
// PATCH /api/admin/pools/:poolId
// Staatus (not_started/playing/finished) ja topeltmärkimise seade
// ---------------------------------------------------------------------------
router.patch('/:poolId', asyncHandler(async (req, res) => {
    const { status, requireDoubleVerification, startTime, startHole, maxPlayers } = req.body;
    const { rows } = await pool.query(
        `UPDATE pools SET
            status = COALESCE($1, status),
            require_double_verification = COALESCE($2, require_double_verification),
            start_time = COALESCE($3, start_time),
            start_hole = COALESCE($4, start_hole),
            max_players = COALESCE($5, max_players)
         WHERE id = $6 RETURNING *`,
        [status, requireDoubleVerification, startTime, startHole, maxPlayers, req.params.poolId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pooli ei leitud.' });
    res.json({ pool: rows[0] });
}));

module.exports = router;
