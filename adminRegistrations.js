const express = require('express');
const pool = require('./db');
const { adminAuth } = require('./adminAuth');
const { asyncHandler } = require('./errorHandler');
const { sendPaymentReminderEmail } = require('./email');

const router = express.Router();
router.use(adminAuth);

// ---------------------------------------------------------------------------
// GET /api/admin/registrations/event/:eventId
// Punkt 53: adminile mängijate nimekiri
// ---------------------------------------------------------------------------
router.get('/event/:eventId', asyncHandler(async (req, res) => {
    const { status } = req.query;
    const params = [req.params.eventId];
    let query = `
        SELECT r.id, r.status, r.registered_at, r.confirmed_at, r.bank_paid_at, r.stebby_paid_at,
               p.id AS player_id, p.player_number, p.first_name, p.last_name, p.email, p.phone,
               d.name AS division_name
        FROM registrations r
        JOIN players p ON p.id = r.player_id
        JOIN divisions d ON d.id = r.division_id
        WHERE r.event_id = $1
    `;
    if (status) {
        params.push(status);
        query += ` AND r.status = $2`;
    }
    query += ' ORDER BY r.registered_at';

    const { rows } = await pool.query(query, params);
    res.json({ registrations: rows });
}));

// ---------------------------------------------------------------------------
// PATCH /api/admin/registrations/:id/payment
// Tasu märkimine/tühistamine kindla kanali (bank/stebby) kaupa.
// Kanalid on teineteist välistavad: kui üks märgitakse makstuks, siis
// teine kanal tühistatakse automaatselt (üks makse tuleb ainult ühest
// kohast - nii on hiljem selge, kust raha reaalselt tuli).
// ---------------------------------------------------------------------------
router.patch('/:id/payment', asyncHandler(async (req, res) => {
    const { channel, paid } = req.body;
    if (!['bank', 'stebby'].includes(channel)) {
        return res.status(400).json({ error: 'channel peab olema bank või stebby.' });
    }
    const column = channel === 'bank' ? 'bank_paid_at' : 'stebby_paid_at';
    const otherColumn = channel === 'bank' ? 'stebby_paid_at' : 'bank_paid_at';

    const { rows } = await pool.query(
        `UPDATE registrations SET
            ${column} = ${paid ? 'now()' : 'NULL'}
            ${paid ? `, ${otherColumn} = NULL` : ''}
         WHERE id = $1 RETURNING *`,
        [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Registreerimist ei leitud.' });
    res.json({ registration: rows[0] });
}));

// ---------------------------------------------------------------------------
// POST /api/admin/registrations/bulk-email
// Saadab makse-meeldetuletuse valitud registreerimiste mängijatele.
// ---------------------------------------------------------------------------
router.post('/bulk-email', asyncHandler(async (req, res) => {
    const { registrationIds, customMessage } = req.body;
    if (!Array.isArray(registrationIds) || registrationIds.length === 0) {
        return res.status(400).json({ error: 'registrationIds on kohustuslik ja peab olema mittetühi massiiv.' });
    }

    const { rows } = await pool.query(
        `SELECT r.id, p.email, p.first_name, e.name AS event_name, e.payment_link
         FROM registrations r
         JOIN players p ON p.id = r.player_id
         JOIN events e ON e.id = r.event_id
         WHERE r.id = ANY($1::int[])`,
        [registrationIds]
    );

    let sent = 0, skipped = 0;
    for (const r of rows) {
        if (!r.email) { skipped++; continue; }
        const result = await sendPaymentReminderEmail({
            to: r.email, playerName: r.first_name, eventName: r.event_name,
            paymentLink: r.payment_link, customMessage: customMessage || null,
        });
        if (result.sent) sent++; else skipped++;
    }

    res.json({ sent, skipped, total: rows.length });
}));

// ---------------------------------------------------------------------------
// PATCH /api/admin/registrations/:id
// Punkt 66C: admin kinnitab REGISTERED -> CONFIRMED kui näeb makset,
// või määrab DNS/DNF/WAITLIST/REMOVED
// ---------------------------------------------------------------------------
router.patch('/:id', asyncHandler(async (req, res) => {
    const { status, divisionId } = req.body;
    const validStatuses = ['registered', 'confirmed', 'waitlist', 'dns', 'dnf', 'removed'];
    if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: `status peab olema \u00fcks: ${validStatuses.join(', ')}` });
    }

    const setConfirmed = status === 'confirmed';

    const { rows } = await pool.query(
        `UPDATE registrations SET
            status = COALESCE($1, status),
            division_id = COALESCE($2, division_id),
            confirmed_at = CASE WHEN $3 THEN now() ELSE confirmed_at END,
            confirmed_by_admin_id = CASE WHEN $3 THEN $4 ELSE confirmed_by_admin_id END
         WHERE id = $5
         RETURNING *`,
        [status, divisionId, setConfirmed, req.admin.id, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Registreerimist ei leitud.' });
    res.json({ registration: rows[0] });
}));

// ---------------------------------------------------------------------------
// POST /api/admin/registrations/add-player
// Punkt 66E: admin lisab mängija, kellel pole veel kontot.
// Kui existingPlayerId on antud, seotakse OLEMASOLEVA mängijaga (ei looda duplikaati).
// ---------------------------------------------------------------------------
router.post('/add-player', asyncHandler(async (req, res) => {
    const { eventId, divisionId, firstName, lastName, pdgaNumber, country, existingPlayerId } = req.body;
    if (!eventId || !divisionId) {
        return res.status(400).json({ error: 'eventId ja divisionId on kohustuslikud.' });
    }
    if (!existingPlayerId && (!firstName || !lastName)) {
        return res.status(400).json({ error: 'firstName ja lastName on kohustuslikud, kui olemasolevat mängijat ei vali.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let player;
        if (existingPlayerId) {
            const { rows } = await client.query('SELECT * FROM players WHERE id = $1', [existingPlayerId]);
            if (!rows[0]) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Mängijat ei leitud.' });
            }
            player = rows[0];
        } else {
            const { rows } = await client.query(
                `INSERT INTO players (player_number, first_name, last_name, pdga_number, country, is_claimed)
                 VALUES (nextval('player_number_seq'), $1, $2, $3, $4, FALSE)
                 RETURNING *`,
                [firstName, lastName, pdgaNumber || null, country || null]
            );
            player = rows[0];
        }

        const { rows: existingReg } = await client.query(
            'SELECT id FROM registrations WHERE event_id = $1 AND player_id = $2',
            [eventId, player.id]
        );
        if (existingReg[0]) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'See mängija on juba sellele võistlusele registreeritud.' });
        }

        const { rows: regRows } = await client.query(
            `INSERT INTO registrations (event_id, player_id, division_id, status, pin_confirmed)
             VALUES ($1, $2, $3, 'confirmed', FALSE)
             RETURNING *`,
            [eventId, player.id, divisionId]
        );

        await client.query('COMMIT');
        res.status(201).json({ player, registration: regRows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// ---------------------------------------------------------------------------
// DELETE /api/admin/registrations/:id
// Admin eemaldab mängija registreerimise täielikult (nt registreeris kogemata
// vale divisjoni, dubleeris end, või loobus telefonitsi). Puhastab ka
// pool_players (teadaolev konks: registration_id ei kaskaadi kustutamisel).
// ---------------------------------------------------------------------------
router.delete('/:id', asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM pool_players WHERE registration_id = $1', [req.params.id]);
    const { rows } = await pool.query('DELETE FROM registrations WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Registreerimist ei leitud.' });
    res.json({ success: true });
}));

module.exports = router;
