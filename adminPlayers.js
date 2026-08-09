const express = require('express');
const pool = require('./db');
const { adminAuth } = require('./adminAuth');
const { asyncHandler } = require('./errorHandler');
const { hashPin } = require('./pin');

const router = express.Router();
router.use(adminAuth);

function generateRandomPin() {
    return Math.floor(1000 + Math.random() * 9000).toString(); // 4-kohaline
}

// ---------------------------------------------------------------------------
// GET /api/admin/players
// Kõik süsteemi mängijad, üle kõikide event'ide, koos otsinguga.
// ---------------------------------------------------------------------------
router.get('/', asyncHandler(async (req, res) => {
    const search = (req.query.search || '').trim();
    const { rows } = await pool.query(
        `SELECT id, player_number, first_name, last_name, email, phone,
                pdga_number, country, is_claimed, created_at
         FROM players
         WHERE $1 = '' OR first_name ILIKE '%'||$1||'%' OR last_name ILIKE '%'||$1||'%'
               OR player_number::text ILIKE '%'||$1||'%' OR email ILIKE '%'||$1||'%'
         ORDER BY created_at DESC
         LIMIT 300`,
        [search]
    );
    res.json({ players: rows });
}));

// ---------------------------------------------------------------------------
// POST /api/admin/players/:playerId/reset-pin
// Punkt 7: admin saab mängija tuvastamisel PIN-i lähtestada.
// Uus PIN tagastatakse VASTUSES - admin ütleb selle mängijale kohapeal.
// Seda ei salvestata kunagi selges tekstis, ei siin ega mujal.
// ---------------------------------------------------------------------------
router.post('/:playerId/reset-pin', asyncHandler(async (req, res) => {
    const newPin = generateRandomPin();
    const pinHash = await hashPin(newPin);

    const { rows } = await pool.query(
        `UPDATE players SET pin_hash = $1, recovery_code_hash = NULL
         WHERE id = $2
         RETURNING id, player_number, first_name, last_name`,
        [pinHash, req.params.playerId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Mängijat ei leitud.' });

    res.json({ player: rows[0], newPin });
}));

module.exports = router;
