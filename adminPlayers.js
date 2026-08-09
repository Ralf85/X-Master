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
