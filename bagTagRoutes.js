const express = require('express');
const pool = require('./db');
const { asyncHandler } = require('./errorHandler');
const bagTag = require('./bagTag');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/bagtag/ranking?gender=M|N
// Avalik - näitab kogu bag tag pingerida ühe soo kohta. Käivitab enne
// pilku heitmist ka mitteaktiivsuse kontrolli (laisk, idempotentne).
// ---------------------------------------------------------------------------
router.get('/ranking', asyncHandler(async (req, res) => {
    const gender = req.query.gender === 'N' ? 'N' : 'M';

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await bagTag.processOverdueInactivePlayers(client);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    const { rows } = await pool.query(
        `SELECT id AS player_id, first_name, last_name, profile_image_url,
                bag_tag_number, bag_tag_previous_number, bag_tag_last_played_at
         FROM players
         WHERE gender = $1 AND bag_tag_number IS NOT NULL
         ORDER BY bag_tag_number ASC`,
        [gender]
    );

    const ranking = rows.map((r) => ({
        playerId: r.player_id,
        firstName: r.first_name,
        lastName: r.last_name,
        profileImageUrl: r.profile_image_url,
        number: r.bag_tag_number,
        trend: r.bag_tag_previous_number !== null ? r.bag_tag_previous_number - r.bag_tag_number : 0,
        lastPlayedAt: r.bag_tag_last_played_at,
    }));

    res.json({ gender, ranking });
}));

module.exports = router;
