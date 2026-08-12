const express = require('express');
const pool = require('./db');
const playerAuth = require('./playerAuth');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();
router.use(playerAuth);

// ---------------------------------------------------------------------------
// GET /api/pools/round/:roundId
// Mängija näeb kõiki selle ringi poole ja kes kus on (punkt 4 - "Poolid" vaade)
// ---------------------------------------------------------------------------
router.get('/round/:roundId', asyncHandler(async (req, res) => {
    const { rows: pools } = await pool.query(
        'SELECT * FROM pools WHERE round_id = $1 ORDER BY pool_number', [req.params.roundId]
    );

    const { rows: players } = await pool.query(
        `SELECT pp.pool_id, p.id AS player_id, p.first_name, p.last_name
         FROM pool_players pp
         JOIN registrations r ON r.id = pp.registration_id
         JOIN players p ON p.id = r.player_id
         WHERE pp.pool_id = ANY($1::int[])`,
        [pools.map((p) => p.id)]
    );

    const poolsWithPlayers = pools.map((p) => ({
        ...p,
        players: players.filter((pl) => pl.pool_id === p.id),
        isFull: p.max_players ? players.filter((pl) => pl.pool_id === p.id).length >= p.max_players : false,
    }));

    const myPool = poolsWithPlayers.find((p) => p.players.some((pl) => pl.player_id === req.player.id));

    res.json({ pools: poolsWithPlayers, myPoolId: myPool ? myPool.id : null });
}));

// ---------------------------------------------------------------------------
// POST /api/pools/:poolId/join
// Mängija valib omale ise pooli, kui seal on ruumi (punkt 3)
// ---------------------------------------------------------------------------
router.post('/:poolId/join', asyncHandler(async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: poolRows } = await client.query('SELECT * FROM pools WHERE id = $1 FOR UPDATE', [req.params.poolId]);
        const poolInfo = poolRows[0];
        if (!poolInfo) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Pooli ei leitud.' }); }
        if (poolInfo.locked) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'See pool on korraldaja poolt lukustatud - vali mõni teine pool.' });
        }

        // Leia mängija registreering selle ringi event'i jaoks
        const { rows: regRows } = await client.query(
            `SELECT r.* FROM registrations r
             JOIN rounds rd ON rd.event_id = r.event_id
             WHERE rd.id = $1 AND r.player_id = $2 AND r.status IN ('registered', 'confirmed')`,
            [poolInfo.round_id, req.player.id]
        );
        const registration = regRows[0];
        if (!registration) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Sul pole selle võistluse jaoks kehtivat registreerimist.' });
        }

        // Kas juba mõnes teises pooli samas ringis?
        const { rows: existingRows } = await client.query(
            `SELECT pp.id FROM pool_players pp
             JOIN pools po ON po.id = pp.pool_id
             WHERE po.round_id = $1 AND pp.registration_id = $2`,
            [poolInfo.round_id, registration.id]
        );
        if (existingRows[0]) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Oled juba selle ringi poolis. Lahku enne sellest.' });
        }

        if (poolInfo.max_players) {
            const { rows: countRows } = await client.query(
                'SELECT count(*) FROM pool_players WHERE pool_id = $1', [poolInfo.id]
            );
            if (parseInt(countRows[0].count, 10) >= poolInfo.max_players) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'See pool on täis.' });
            }
        }

        const { rows: joined } = await client.query(
            'INSERT INTO pool_players (pool_id, registration_id) VALUES ($1, $2) RETURNING *',
            [poolInfo.id, registration.id]
        );

        await client.query('COMMIT');
        res.status(201).json({ poolPlayer: joined[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// ---------------------------------------------------------------------------
// DELETE /api/pools/:poolId/leave
// Mängija lahkub poolist, kui tahab teist valida
// ---------------------------------------------------------------------------
router.delete('/:poolId/leave', asyncHandler(async (req, res) => {
    await pool.query(
        `DELETE FROM pool_players WHERE pool_id = $1 AND registration_id IN (
            SELECT id FROM registrations WHERE player_id = $2
         )`,
        [req.params.poolId, req.player.id]
    );
    res.json({ message: 'Poolist lahkutud.' });
}));

module.exports = router;
