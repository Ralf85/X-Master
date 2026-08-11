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

// ---------------------------------------------------------------------------
// GET /api/admin/players/export-emails
// Laeb kõigi mängijate emailid CSV-na alla (nt uudiskirja tööriista jaoks).
// ---------------------------------------------------------------------------
router.get('/export-emails', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT player_number, first_name, last_name, email
         FROM players
         WHERE email IS NOT NULL AND email != ''
         ORDER BY first_name`
    );
    const header = 'Player ID,Eesnimi,Perekonnanimi,Email\n';
    const csvRows = rows.map((r) =>
        [r.player_number, r.first_name, r.last_name, r.email]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mangijate-emailid.csv"');
    res.send('\uFEFF' + header + csvRows); // BOM aitab Excelil õigesti ä/ö/ü kuvada
}));

// ---------------------------------------------------------------------------
// DELETE /api/admin/players/:playerId
// Kustutab mängija konto jäädavalt, koos kõigi registreerumiste, tulemuste
// ja logikirjetega (nii tema enda kui ka nendega, kus ta oli märkija).
// ---------------------------------------------------------------------------
router.delete('/:playerId', asyncHandler(async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: playerRows } = await client.query('SELECT id, first_name, last_name FROM players WHERE id = $1', [req.params.playerId]);
        if (!playerRows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Mängijat ei leitud.' });
        }

        // official_scores.last_entry_id ei ole CASCADE peal - tühjenda need
        // enne, muidu blokeerib see score_entries kustutamist.
        await client.query(
            `UPDATE official_scores SET last_entry_id = NULL
             WHERE last_entry_id IN (
                 SELECT id FROM score_entries WHERE player_id = $1 OR entered_by_player_id = $1
             )`,
            [req.params.playerId]
        );
        await client.query(
            'DELETE FROM score_entries WHERE player_id = $1 OR entered_by_player_id = $1',
            [req.params.playerId]
        );
        await client.query(
            'DELETE FROM score_audit_log WHERE player_id = $1 OR actor_player_id = $1',
            [req.params.playerId]
        );
        await client.query(
            'DELETE FROM score_conflicts WHERE player_id = $1 OR attempted_by_player_id = $1',
            [req.params.playerId]
        );
        await client.query('DELETE FROM official_scores WHERE player_id = $1', [req.params.playerId]);
        // pool_players.registration_id ei ole CASCADE peal - kustuta enne,
        // muidu blokeerib see registrations'i kustutamist.
        await client.query(
            'DELETE FROM pool_players WHERE registration_id IN (SELECT id FROM registrations WHERE player_id = $1)',
            [req.params.playerId]
        );
        await client.query('DELETE FROM registrations WHERE player_id = $1', [req.params.playerId]);

        const { rows } = await client.query('DELETE FROM players WHERE id = $1 RETURNING id', [req.params.playerId]);

        await client.query('COMMIT');
        res.json({ message: 'Mängija kustutatud.', player: playerRows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

module.exports = router;
