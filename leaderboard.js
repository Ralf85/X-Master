const express = require('express');
const pool = require('./db');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/leaderboard/event/:slug
// Mugavam jagatav link (nt Vanalinna Open leaderboard) - leiab ise
// event'i praeguse/viimase ringi, et ei peaks round_id't teadma.
// ---------------------------------------------------------------------------
router.get('/event/:slug', asyncHandler(async (req, res) => {
    const { rows: eventRows } = await pool.query('SELECT id FROM events WHERE slug = $1', [req.params.slug]);
    if (!eventRows[0]) return res.status(404).json({ error: 'Võistlust ei leitud.' });

    const { rows: roundRows } = await pool.query(
        `SELECT id FROM rounds WHERE event_id = $1
         ORDER BY (status = 'live') DESC, round_number DESC
         LIMIT 1`,
        [eventRows[0].id]
    );
    if (!roundRows[0]) return res.status(404).json({ error: 'Sellel võistlusel pole veel ühtegi ringi loodud.' });

    req.params.roundId = roundRows[0].id;
    return getRoundLeaderboard(req, res);
}));

// ---------------------------------------------------------------------------
// GET /api/leaderboard/round/:roundId
// Punktid 31-33, 38-42: live leaderboard, avalik (ei nõua sisselogimist)
// ---------------------------------------------------------------------------
router.get('/round/:roundId', asyncHandler(getRoundLeaderboard));

async function getRoundLeaderboard(req, res) {
    const { rows: roundRows } = await pool.query(
        `SELECT r.id, r.round_number, r.name AS round_name, r.status,
                e.id AS event_id, e.name AS event_name, e.slug
         FROM rounds r JOIN events e ON e.id = r.event_id
         WHERE r.id = $1`,
        [req.params.roundId]
    );
    const roundInfo = roundRows[0];
    if (!roundInfo) return res.status(404).json({ error: 'Ringi ei leitud.' });

    const { rows: holes } = await pool.query(
        `SELECT h.id, h.hole_number, h.par, h.sort_order, h.park_id,
                pk.name AS park_name, pk.color AS park_color
         FROM holes h LEFT JOIN parks pk ON pk.id = h.park_id
         WHERE h.round_id = $1
         ORDER BY h.sort_order`,
        [req.params.roundId]
    );

    const { rows: players } = await pool.query(
        `SELECT DISTINCT p.id AS player_id, p.player_number, p.first_name, p.last_name,
                p.profile_image_url, d.id AS division_id, d.name AS division_name
         FROM pool_players pp
         JOIN registrations r ON r.id = pp.registration_id
         JOIN players p ON p.id = r.player_id
         JOIN divisions d ON d.id = r.division_id
         JOIN pools po ON po.id = pp.pool_id
         WHERE po.round_id = $1`,
        [req.params.roundId]
    );

    const { rows: scores } = await pool.query(
        `SELECT player_id, hole_id, strokes, status FROM official_scores WHERE round_id = $1`,
        [req.params.roundId]
    );

    const scoreMap = {};
    for (const s of scores) {
        scoreMap[`${s.player_id}_${s.hole_id}`] = s;
    }

    const totalPar = holes.reduce((sum, h) => sum + h.par, 0);

    const leaderboard = players.map((player) => {
        const holeScores = holes.map((h) => {
            const s = scoreMap[`${player.player_id}_${h.id}`];
            return {
                holeId: h.id,
                holeNumber: h.hole_number,
                par: h.par,
                strokes: s ? s.strokes : null,
                status: s ? s.status : null,
            };
        });
        const completed = holeScores.filter((h) => h.strokes !== null);
        const totalStrokes = completed.reduce((sum, h) => sum + h.strokes, 0);
        const completedPar = completed.reduce((sum, h) => sum + h.par, 0);

        return {
            playerId: player.player_id,
            playerNumber: player.player_number,
            firstName: player.first_name,
            lastName: player.last_name,
            profileImageUrl: player.profile_image_url,
            divisionId: player.division_id,
            divisionName: player.division_name,
            thru: completed.length,
            totalStrokes,
            relativeToPar: completed.length > 0 ? totalStrokes - completedPar : null,
            holeScores,
        };
    });

    // Sorteeri: kõigepealt need, kel on tulemusi, paremuse järjekorras; lõpetamata eraldi
    leaderboard.sort((a, b) => {
        if (a.thru === 0 && b.thru === 0) return 0;
        if (a.thru === 0) return 1;
        if (b.thru === 0) return -1;
        return a.relativeToPar - b.relativeToPar;
    });

    res.json({
        round: roundInfo,
        holes,
        totalPar,
        leaderboard,
    });
}

// ---------------------------------------------------------------------------
// GET /api/leaderboard/round/:roundId/park/:parkId
// Punktid 35-37: pargipõhine ranking
// ---------------------------------------------------------------------------
router.get('/round/:roundId/park/:parkId', asyncHandler(async (req, res) => {
    const { rows: holes } = await pool.query(
        `SELECT id, hole_number, par, sort_order FROM holes
         WHERE round_id = $1 AND park_id = $2 ORDER BY sort_order`,
        [req.params.roundId, req.params.parkId]
    );
    if (holes.length === 0) return res.status(404).json({ error: 'Sellel pargil pole radu selles ringis.' });

    const holeIds = holes.map((h) => h.id);
    const parkPar = holes.reduce((sum, h) => sum + h.par, 0);

    const { rows: scores } = await pool.query(
        `SELECT os.player_id, os.hole_id, os.strokes, p.first_name, p.last_name, p.player_number
         FROM official_scores os
         JOIN players p ON p.id = os.player_id
         WHERE os.round_id = $1 AND os.hole_id = ANY($2::int[])`,
        [req.params.roundId, holeIds]
    );

    const byPlayer = {};
    for (const s of scores) {
        if (!byPlayer[s.player_id]) {
            byPlayer[s.player_id] = {
                playerId: s.player_id,
                firstName: s.first_name,
                lastName: s.last_name,
                playerNumber: s.player_number,
                strokes: 0,
                holesCompleted: 0,
            };
        }
        byPlayer[s.player_id].strokes += s.strokes;
        byPlayer[s.player_id].holesCompleted += 1;
    }

    const ranking = Object.values(byPlayer)
        .filter((p) => p.holesCompleted === holes.length)
        .map((p) => ({ ...p, relativeToPar: p.strokes - parkPar }))
        .sort((a, b) => a.relativeToPar - b.relativeToPar);

    res.json({ park: { holeCount: holes.length, par: parkPar }, ranking });
}));

// ---------------------------------------------------------------------------
// GET /api/leaderboard/round/:roundId/pools
// Avalik poolide vaade (punkt 4/54) - kes kus mängib, ilma sisselogimiseta
// ---------------------------------------------------------------------------
router.get('/round/:roundId/pools', asyncHandler(async (req, res) => {
    const { rows: pools } = await pool.query(
        'SELECT id, pool_number, start_time, start_hole FROM pools WHERE round_id = $1 ORDER BY pool_number',
        [req.params.roundId]
    );
    const { rows: players } = await pool.query(
        `SELECT pp.pool_id, p.first_name, p.last_name
         FROM pool_players pp
         JOIN registrations r ON r.id = pp.registration_id
         JOIN players p ON p.id = r.player_id
         WHERE pp.pool_id = ANY($1::int[])
         ORDER BY p.first_name`,
        [pools.map((p) => p.id)]
    );
    const result = pools.map((p) => ({
        ...p,
        players: players.filter((pl) => pl.pool_id === p.id),
    }));
    res.json({ pools: result });
}));

module.exports = router;
