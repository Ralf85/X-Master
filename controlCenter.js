const express = require('express');
const pool = require('./db');
const { adminAuth } = require('./adminAuth');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();
router.use(adminAuth);

const SLOW_THRESHOLD_MINUTES = 15;

// ---------------------------------------------------------------------------
// GET /api/admin/control-center/round/:roundId
// Punktid 56-57: reaalajas ülevaade ringist
// ---------------------------------------------------------------------------
router.get('/round/:roundId', asyncHandler(async (req, res) => {
    const roundId = req.params.roundId;

    const { rows: holeRows } = await pool.query('SELECT count(*)::int AS n FROM holes WHERE round_id = $1', [roundId]);
    const totalHoles = holeRows[0].n;

    const { rows: players } = await pool.query(
        `SELECT p.id AS player_id, p.first_name, p.last_name, po.id AS pool_id, po.pool_number
         FROM pool_players pp
         JOIN registrations r ON r.id = pp.registration_id
         JOIN players p ON p.id = r.player_id
         JOIN pools po ON po.id = pp.pool_id
         WHERE po.round_id = $1`,
        [roundId]
    );

    const { rows: scoreCounts } = await pool.query(
        `SELECT player_id, count(*)::int AS n FROM official_scores WHERE round_id = $1 GROUP BY player_id`,
        [roundId]
    );
    const scoredMap = {};
    for (const s of scoreCounts) scoredMap[s.player_id] = s.n;

    let playing = 0, finished = 0, notStarted = 0;
    for (const p of players) {
        const scored = scoredMap[p.player_id] || 0;
        if (scored === 0) notStarted++;
        else if (totalHoles > 0 && scored >= totalHoles) finished++;
        else playing++;
    }

    const { rows: conflictRows } = await pool.query(
        `SELECT count(*)::int AS n FROM score_conflicts WHERE round_id = $1 AND status = 'open'`,
        [roundId]
    );
    const openConflicts = conflictRows[0].n;

    const { rows: pools } = await pool.query('SELECT * FROM pools WHERE round_id = $1 ORDER BY pool_number', [roundId]);

    const { rows: lastActivity } = await pool.query(
        `SELECT po.id AS pool_id, MAX(se.entered_at) AS last_entry
         FROM pools po
         JOIN pool_players pp ON pp.pool_id = po.id
         JOIN registrations r ON r.id = pp.registration_id
         LEFT JOIN score_entries se ON se.player_id = r.player_id AND se.round_id = po.round_id
         WHERE po.round_id = $1
         GROUP BY po.id`,
        [roundId]
    );
    const activityMap = {};
    for (const a of lastActivity) activityMap[a.pool_id] = a.last_entry;

    const poolSummaries = pools.map((po) => {
        const poolPlayers = players.filter((p) => p.pool_id === po.id);
        const poolScored = poolPlayers.reduce((sum, p) => sum + (scoredMap[p.player_id] || 0), 0);
        const poolMaxPossible = poolPlayers.length * totalHoles;
        const lastEntry = activityMap[po.id];
        const minutesSince = lastEntry ? Math.floor((Date.now() - new Date(lastEntry).getTime()) / 60000) : null;
        const isComplete = poolMaxPossible > 0 && poolScored >= poolMaxPossible;
        const isSlow = !isComplete && lastEntry && minutesSince >= SLOW_THRESHOLD_MINUTES;
        const notStartedYet = !lastEntry && poolPlayers.length > 0;

        return {
            id: po.id,
            poolNumber: po.pool_number,
            playerCount: poolPlayers.length,
            holesCompleted: totalHoles > 0 ? Math.floor(poolScored / Math.max(poolPlayers.length, 1)) : 0,
            totalHoles,
            isComplete,
            isSlow,
            notStartedYet,
            minutesSinceActivity: minutesSince,
        };
    });

    res.json({
        totalHoles,
        totalPlayers: players.length,
        playing, finished, notStarted,
        openConflicts,
        slowPoolsCount: poolSummaries.filter((p) => p.isSlow).length,
        pools: poolSummaries,
    });
}));

module.exports = router;
