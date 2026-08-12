const express = require('express');
const dbPool = require('./db');
const playerAuth = require('./playerAuth');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();
router.use(playerAuth);

// ---------------------------------------------------------------------------
// GET /api/scorecard/:poolId
// Punkt 16-17: scorecardi avamine - mängijad, rajad, juba sisestatud tulemused
// ---------------------------------------------------------------------------
router.get('/:poolId', asyncHandler(async (req, res) => {
    const { rows: poolRows } = await dbPool.query(
        `SELECT po.*, r.event_id, r.round_number
         FROM pools po JOIN rounds r ON r.id = po.round_id
         WHERE po.id = $1`,
        [req.params.poolId]
    );
    const poolInfo = poolRows[0];
    if (!poolInfo) return res.status(404).json({ error: 'Pooli ei leitud.' });

    const { rows: players } = await dbPool.query(
        `SELECT pp.id AS pool_player_id, p.id AS player_id, p.player_number,
                p.first_name, p.last_name, p.profile_image_url
         FROM pool_players pp
         JOIN registrations r ON r.id = pp.registration_id
         JOIN players p ON p.id = r.player_id
         WHERE pp.pool_id = $1
         ORDER BY pp.id`,
        [req.params.poolId]
    );

    // Turvakontroll: ainult selle pooli liikmed tohivad scorecardi näha
    const isMember = players.some((p) => p.player_id === req.player.id);
    if (!isMember) {
        return res.status(403).json({ error: 'Sa ei kuulu sellesse gruppi.' });
    }

    const { rows: holes } = await dbPool.query(
        `SELECT h.*, pk.name AS park_name, pk.color AS park_color
         FROM holes h LEFT JOIN parks pk ON pk.id = h.park_id
         WHERE h.round_id = $1
         ORDER BY h.sort_order`,
        [poolInfo.round_id]
    );

    const { rows: scores } = await dbPool.query(
        `SELECT hole_id, player_id, strokes, status, verified
         FROM official_scores
         WHERE round_id = $1 AND player_id = ANY($2::int[])`,
        [poolInfo.round_id, players.map((p) => p.player_id)]
    );

    res.json({ pool: poolInfo, players, holes, scores });
}));

// ---------------------------------------------------------------------------
// POST /api/scorecard/:poolId/holes/:holeId/players/:playerId
// Punktid 20-29: score-sisestus, matching ja konfliktituvastus
// ---------------------------------------------------------------------------
router.post('/:poolId/holes/:holeId/players/:playerId', asyncHandler(async (req, res) => {
    const isDnp = req.body.dnp === true;
    const strokes = isDnp ? null : req.body.strokes;
    const holeId = parseInt(req.params.holeId, 10);
    const targetPlayerId = parseInt(req.params.playerId, 10);

    if (!isDnp && (!Number.isInteger(strokes) || strokes < 1)) {
        return res.status(400).json({ error: 'strokes peab olema positiivne täisarv (või dnp: true, kui rada jäi vahele).' });
    }

    const { rows: poolRows } = await dbPool.query('SELECT * FROM pools WHERE id = $1', [req.params.poolId]);
    const poolInfo = poolRows[0];
    if (!poolInfo) return res.status(404).json({ error: 'Pooli ei leitud.' });

    const { rows: members } = await dbPool.query(
        `SELECT p.id AS player_id
         FROM pool_players pp
         JOIN registrations r ON r.id = pp.registration_id
         JOIN players p ON p.id = r.player_id
         WHERE pp.pool_id = $1`,
        [req.params.poolId]
    );
    const memberIds = members.map((m) => m.player_id);

    // Turvakontroll: sisestaja peab kuuluma samasse pooli, ja mängija, kelle
    // tulemust märgitakse, peab samuti sinna kuuluma (punkt 61 - autoriseerimine)
    if (!memberIds.includes(req.player.id)) {
        return res.status(403).json({ error: 'Sa ei kuulu sellesse gruppi.' });
    }
    if (!memberIds.includes(targetPlayerId)) {
        return res.status(400).json({ error: 'See mängija ei kuulu sellesse gruppi.' });
    }

    const { rows: holeRows } = await dbPool.query('SELECT * FROM holes WHERE id = $1', [holeId]);
    const hole = holeRows[0];
    if (!hole || hole.round_id !== poolInfo.round_id) {
        return res.status(400).json({ error: 'See rada ei kuulu selle grupi ringi.' });
    }

    const client = await dbPool.connect();
    try {
        await client.query('BEGIN');

        // Lukusta olemasolev rida, kui see on olemas, et vältida samaaegseid kirjutusi
        const { rows: existingRows } = await client.query(
            `SELECT * FROM official_scores WHERE round_id = $1 AND hole_id = $2 AND player_id = $3 FOR UPDATE`,
            [poolInfo.round_id, holeId, targetPlayerId]
        );
        const existing = existingRows[0];
        const existingIsDnp = existing && existing.status === 'dnp';
        const valuesMatch = existing && (
            (isDnp && existingIsDnp) || (!isDnp && !existingIsDnp && existing.strokes === strokes)
        );
        const newStatus = isDnp ? 'dnp' : 'normal';

        const { rows: entryRows } = await client.query(
            `INSERT INTO score_entries (round_id, hole_id, player_id, entered_by_player_id, strokes)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [poolInfo.round_id, holeId, targetPlayerId, req.player.id, strokes]
        );
        const entry = entryRows[0];

        let result;

        if (!existing) {
            // Esimene sisestus selle mängija+raja kohta - punkt 23
            const autoVerified = !poolInfo.require_double_verification;
            const { rows: created } = await client.query(
                `INSERT INTO official_scores (round_id, hole_id, player_id, strokes, status, last_entry_id, verified)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [poolInfo.round_id, holeId, targetPlayerId, strokes, newStatus, entry.id, autoVerified]
            );
            result = created[0];
            await client.query(
                `INSERT INTO score_audit_log (round_id, hole_id, player_id, actor_type, actor_player_id, action, new_value)
                 VALUES ($1, $2, $3, 'player', $4, 'entry', $5)`,
                [poolInfo.round_id, holeId, targetPlayerId, req.player.id, strokes]
            );
        } else if (valuesMatch) {
            // Ühtib olemasolevaga - punkt 24, kinnitab ja vajadusel verifitseerib
            await client.query(
                `UPDATE score_entries SET matched_existing = TRUE WHERE id = $1`, [entry.id]
            );
            const { rows: updated } = await client.query(
                `UPDATE official_scores SET verified = TRUE, last_entry_id = $1, updated_at = now()
                 WHERE id = $2 RETURNING *`,
                [entry.id, existing.id]
            );
            result = updated[0];
            await client.query(
                `INSERT INTO score_audit_log (round_id, hole_id, player_id, actor_type, actor_player_id, action, old_value, new_value)
                 VALUES ($1, $2, $3, 'player', $4, 'match', $5, $5)`,
                [poolInfo.round_id, holeId, targetPlayerId, req.player.id, strokes]
            );
        } else {
            // Erineb olemasolevast - kontrolli, kas seesama inimene, kes selle
            // algselt sisestas, parandab nüüd ennast (lubatud otse), või on
            // tegu TEISE märkijaga (jääb konfliktiks, vajab admini)
            let originalEnteredBy = null;
            if (existing.last_entry_id) {
                const { rows: origRows } = await client.query(
                    'SELECT entered_by_player_id FROM score_entries WHERE id = $1',
                    [existing.last_entry_id]
                );
                originalEnteredBy = origRows[0]?.entered_by_player_id;
            }

            if (originalEnteredBy === req.player.id) {
                // Sama märkija parandab iseenda varasemat sisestust - lubatud otse,
                // EI teki konflikti, aga logitakse eraldi "self_correction"'ina
                const { rows: updated } = await client.query(
                    `UPDATE official_scores SET strokes = $1, status = $2, last_entry_id = $3, updated_at = now()
                     WHERE id = $4 RETURNING *`,
                    [strokes, newStatus, entry.id, existing.id]
                );
                result = updated[0];
                await client.query(
                    `INSERT INTO score_audit_log (round_id, hole_id, player_id, actor_type, actor_player_id, action, old_value, new_value)
                     VALUES ($1, $2, $3, 'player', $4, 'self_correction', $5, $6)`,
                    [poolInfo.round_id, holeId, targetPlayerId, req.player.id, existing.strokes, strokes]
                );
            } else {
                // Teine märkija üritab muuta - EI kirjutata üle, tekib konflikt (nagu enne)
                await client.query(
                    `UPDATE score_entries SET caused_conflict = TRUE WHERE id = $1`, [entry.id]
                );
                await client.query(
                    `INSERT INTO score_conflicts (round_id, hole_id, player_id, existing_value, attempted_value, attempted_by_player_id)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [poolInfo.round_id, holeId, targetPlayerId, existing.strokes, strokes, req.player.id]
                );
                const { rows: updated } = await client.query(
                    `UPDATE official_scores SET status = 'conflict' WHERE id = $1 RETURNING *`,
                    [existing.id]
                );
                result = updated[0];
                await client.query(
                    `INSERT INTO score_audit_log (round_id, hole_id, player_id, actor_type, actor_player_id, action, old_value, new_value)
                     VALUES ($1, $2, $3, 'player', $4, 'conflict', $5, $6)`,
                    [poolInfo.round_id, holeId, targetPlayerId, req.player.id, existing.strokes, strokes]
                );
            }
        }

        await client.query('COMMIT');
        res.status(result.status === 'conflict' ? 409 : 200).json({ officialScore: result });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

module.exports = router;
