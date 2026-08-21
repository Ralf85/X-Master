const express = require('express');
const pool = require('./db');
const playerAuth = require('./playerAuth');
const { asyncHandler } = require('./errorHandler');
const lhv = require('./lhv');

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /api/payments/lhv/start/:registrationId
// Mängija (autenditud) käivitab LHV makse oma registreerimise jaoks.
// Tagastab payment_link_url, kuhu klient tuleb suunata.
// ---------------------------------------------------------------------------
router.post('/lhv/start/:registrationId', playerAuth, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT r.id, r.player_id, r.bank_paid_at, r.stebby_paid_at,
                e.id AS event_id, e.name AS event_name, e.entry_fee,
                p.email, p.first_name, p.last_name
         FROM registrations r
         JOIN events e ON e.id = r.event_id
         JOIN players p ON p.id = r.player_id
         WHERE r.id = $1`,
        [req.params.registrationId]
    );
    const reg = rows[0];
    if (!reg) return res.status(404).json({ error: 'Registreerimist ei leitud.' });
    if (reg.player_id !== req.player.id) return res.status(403).json({ error: 'See pole sinu registreerimine.' });
    if (reg.bank_paid_at || reg.stebby_paid_at) return res.status(400).json({ error: 'Juba makstud.' });
    if (!reg.entry_fee) return res.status(400).json({ error: 'Sellel võistlusel pole osalustasu summat määratud - anna korraldajale teada.' });

    const notification = await lhv.createNotification({
        amountEur: Number(reg.entry_fee),
        description: `${reg.event_name} - osalustasu`,
        payeeEmail: reg.email,
        payeeName: `${reg.first_name} ${reg.last_name}`,
        metadata: { registration_id: reg.id },
    });

    await pool.query(
        `UPDATE registrations SET lhv_notification_token = $1, lhv_payment_link_url = $2 WHERE id = $3`,
        [notification.token, notification.payment_link_url, reg.id]
    );

    res.json({ paymentLinkUrl: notification.payment_link_url });
}));

// ---------------------------------------------------------------------------
// GET /api/payments/lhv/status/:registrationId
// Mängija (autenditud) küsib oma makse hetkeseisu - kasulik nt kui ta
// tuleb LHV maksekeskkonnast tagasi ja tahame kohe värsket staatust näidata,
// ilma et peaks ootama callback'i/järgmist automaatset värskendust.
// ---------------------------------------------------------------------------
router.get('/lhv/status/:registrationId', playerAuth, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT id, player_id, lhv_notification_token, bank_paid_at FROM registrations WHERE id = $1`,
        [req.params.registrationId]
    );
    const reg = rows[0];
    if (!reg) return res.status(404).json({ error: 'Registreerimist ei leitud.' });
    if (reg.player_id !== req.player.id) return res.status(403).json({ error: 'See pole sinu registreerimine.' });

    if (reg.bank_paid_at) return res.json({ paid: true });
    if (!reg.lhv_notification_token) return res.json({ paid: false });

    const notification = await lhv.getNotification(reg.lhv_notification_token);
    if (notification.status === 'Paid') {
        await pool.query('UPDATE registrations SET bank_paid_at = now() WHERE id = $1', [reg.id]);
        return res.json({ paid: true });
    }
    res.json({ paid: false, status: notification.status });
}));

// ---------------------------------------------------------------------------
// POST /api/payments/lhv/callback
// LHV kutsub selle ise välja, kui makse staatus muutub (seadista see URL
// LHV kaupmeheportaalis: E-shop settings -> Callback URL).
// Me EI usalda callback'i sisu pimesi - küsime staatuse alati otse LHV-lt
// tagasi, et vältida võltsitud kinnitusi.
// ---------------------------------------------------------------------------
router.post('/lhv/callback', express.urlencoded({ extended: true }), asyncHandler(async (req, res) => {
    const token = req.body.notification_token || req.body.token || req.query.token;
    if (!token) return res.status(400).send('token puudub');

    const { rows } = await pool.query(
        'SELECT id FROM registrations WHERE lhv_notification_token = $1', [token]
    );
    const reg = rows[0];
    if (!reg) return res.status(404).send('registreerimist ei leitud');

    const notification = await lhv.getNotification(token);
    if (notification.status === 'Paid') {
        await pool.query('UPDATE registrations SET bank_paid_at = now() WHERE id = $1', [reg.id]);
    }

    res.status(200).send('OK');
}));

module.exports = router;
