const express = require('express');
const pool = require('./db');
const { adminAuth } = require('./adminAuth');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();
router.use(adminAuth);

// ---------------------------------------------------------------------------
// GET /api/admin/scores/conflicts/round/:roundId
// Punkt 47: admin näeb kõiki lahendamata konflikte
// ---------------------------------------------------------------------------
router.get('/conflicts/round/:roundId', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT sc.*, p.first_name, p.last_name, p.player_number, h.hole_number
         FROM score_conflicts sc
         JOIN players p ON p.id = sc.player_id
         JOIN holes h ON h.id = sc.hole_id
         WHERE sc.round_id = $1 AND sc.status = 'open'
         ORDER BY sc.created_at`,
        [req.params.roundId]
    );
    res.json({ conflicts: rows });
}));

// ---------------------------------------------------------------------------
// PATCH /api/admin/scores/conflicts/:conflictId
// Punkt 27: admin lahendab konflikti, valides õige väärtuse
// ---------------------------------------------------------------------------
router.patch('/conflicts/:conflictId', asyncHandler(async (req, res) => {
    const { resolutionValue, reason } = req.body;
    if (!Number.isInteger(resolutionValue)) {
        return res.status(400).json({ error: 'resolutionValue peab olema täisarv.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: conflictRows } = await client.query(
            `SELECT * FROM score_conflicts WHERE id = $1 AND status = 'open' FOR UPDATE`,
            [req.params.conflictId]
        );
        const conflict = conflictRows[0];
        if (!conflict) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Avatud konflikti ei leitud.' });
        }

        await client.query(
            `UPDATE score_conflicts SET
                status = 'resolved', resolved_by_admin_id = $1, resolution_value = $2,
                resolution_reason = $3, resolved_at = now()
             WHERE id = $4`,
            [req.admin.id, resolutionValue, reason || null, conflict.id]
        );

        const { rows: updatedScore } = await client.query(
            `UPDATE official_scores SET
                strokes = $1, status = 'normal', verified = TRUE, set_by_admin_id = $2, updated_at = now()
             WHERE round_id = $3 AND hole_id = $4 AND player_id = $5
             RETURNING *`,
            [resolutionValue, req.admin.id, conflict.round_id, conflict.hole_id, conflict.player_id]
        );

        await client.query(
            `INSERT INTO score_audit_log (round_id, hole_id, player_id, actor_type, actor_admin_id, action, old_value, new_value, reason)
             VALUES ($1, $2, $3, 'admin', $4, 'admin_change', $5, $6, $7)`,
            [conflict.round_id, conflict.hole_id, conflict.player_id, req.admin.id,
             conflict.existing_value, resolutionValue, reason || 'Conflict resolved']
        );

        await client.query('COMMIT');
        res.json({ officialScore: updatedScore[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// ---------------------------------------------------------------------------
// PATCH /api/admin/scores/round/:roundId/holes/:holeId/players/:playerId
// Punkt 29: admin muudab tulemust otse, ka väljaspool konflikti (nõuab põhjust)
// ---------------------------------------------------------------------------
router.patch('/round/:roundId/holes/:holeId/players/:playerId', asyncHandler(async (req, res) => {
    const { strokes, reason } = req.body;
    if (!Number.isInteger(strokes) || strokes < 1) {
        return res.status(400).json({ error: 'strokes peab olema positiivne täisarv.' });
    }
    if (!reason) {
        return res.status(400).json({ error: 'reason on kohustuslik admini muudatuse jaoks.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: existingRows } = await client.query(
            `SELECT * FROM official_scores WHERE round_id = $1 AND hole_id = $2 AND player_id = $3 FOR UPDATE`,
            [req.params.roundId, req.params.holeId, req.params.playerId]
        );
        const existing = existingRows[0];
        const oldValue = existing ? existing.strokes : null;

        const { rows: upserted } = await client.query(
            `INSERT INTO official_scores (round_id, hole_id, player_id, strokes, status, verified, set_by_admin_id)
             VALUES ($1, $2, $3, $4, 'normal', TRUE, $5)
             ON CONFLICT (round_id, hole_id, player_id)
             DO UPDATE SET strokes = $4, status = 'normal', verified = TRUE, set_by_admin_id = $5, updated_at = now()
             RETURNING *`,
            [req.params.roundId, req.params.holeId, req.params.playerId, strokes, req.admin.id]
        );

        await client.query(
            `INSERT INTO score_audit_log (round_id, hole_id, player_id, actor_type, actor_admin_id, action, old_value, new_value, reason)
             VALUES ($1, $2, $3, 'admin', $4, 'admin_change', $5, $6, $7)`,
            [req.params.roundId, req.params.holeId, req.params.playerId, req.admin.id, oldValue, strokes, reason]
        );

        await client.query('COMMIT');
        res.json({ officialScore: upserted[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// ---------------------------------------------------------------------------
// GET /api/admin/scores/self-corrections/:eventId
// Logi: kus märkija on TAGANTJÄRELE muutnud iseenda varasemat sisestust
// (mitte konflikt teise inimesega - vt score_conflicts selle jaoks).
// ---------------------------------------------------------------------------
router.get('/self-corrections/:eventId', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT sal.id, sal.old_value, sal.new_value, sal.created_at,
                h.hole_number, p.first_name, p.last_name, p.player_number,
                ap.first_name AS actor_first_name, ap.last_name AS actor_last_name
         FROM score_audit_log sal
         JOIN rounds r ON r.id = sal.round_id
         JOIN holes h ON h.id = sal.hole_id
         JOIN players p ON p.id = sal.player_id
         LEFT JOIN players ap ON ap.id = sal.actor_player_id
         WHERE r.event_id = $1 AND sal.action = 'self_correction'
         ORDER BY sal.created_at DESC
         LIMIT 300`,
        [req.params.eventId]
    );
    res.json({ log: rows });
}));

module.exports = router;
