const express = require('express');
const pool = require('./db');
const playerAuth = require('./playerAuth');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();
router.use(playerAuth);

// ---------------------------------------------------------------------------
// POST /api/registrations/:eventId
// Registreerimine - mängija on juba sisselogimisega autenditud, PIN-i
// uuesti ei küsita (see nõue eemaldati).
// ---------------------------------------------------------------------------
router.post('/:eventId', asyncHandler(async (req, res) => {
    const { rows: eventRows } = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.eventId]);
    const event = eventRows[0];
    if (!event) return res.status(404).json({ error: 'Võistlust ei leitud.' });
    if (event.status !== 'registration_open') {
        return res.status(400).json({ error: 'Registreerimine ei ole hetkel avatud.' });
    }
    if (event.registration_end && new Date() > new Date(event.registration_end)) {
        return res.status(400).json({ error: 'Registreerimise tähtaeg on möödas.' });
    }

    // Divisjon määratakse automaatselt mängija soo järgi (Mehed/Naised).
    // Kui divisionId on erandkorras käsitsi kaasa antud (nt vanem integratsioon),
    // kasutatakse seda; muidu otsitakse event'i divisjon, mille gender kattub.
    let { divisionId } = req.body;
    if (!divisionId) {
        const { rows: playerRows } = await pool.query('SELECT gender FROM players WHERE id = $1', [req.player.id]);
        const gender = playerRows[0]?.gender;
        if (!gender) {
            return res.status(400).json({ error: 'Sinu profiilil pole sugu määratud - palun täienda profiili (Minu konto), siis saad registreeruda.' });
        }
        const { rows: divRows } = await pool.query(
            'SELECT id FROM divisions WHERE event_id = $1 AND gender = $2',
            [req.params.eventId, gender]
        );
        if (!divRows[0]) {
            return res.status(400).json({ error: 'Sellel võistlusel pole veel sinu soole vastavat divisjoni. Võta ühendust korraldajaga.' });
        }
        divisionId = divRows[0].id;
    }

    if (event.registration_limit) {
        const { rows: countRows } = await pool.query(
            `SELECT count(*) FROM registrations WHERE event_id = $1 AND status IN ('registered', 'confirmed')`,
            [req.params.eventId]
        );
        if (parseInt(countRows[0].count, 10) >= event.registration_limit) {
            return res.status(400).json({ error: 'Võistlus on täis.' });
        }
    }

    const { rows } = await pool.query(
        `INSERT INTO registrations (event_id, player_id, division_id, status, pin_confirmed)
         VALUES ($1, $2, $3, 'registered', TRUE)
         RETURNING *`,
        [req.params.eventId, req.player.id, divisionId]
    );

    res.status(201).json({ registration: rows[0] });
}));

// ---------------------------------------------------------------------------
// GET /api/registrations
// Punkt 11: mängija enda tulevased/toimunud võistlused
// ---------------------------------------------------------------------------
router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT r.id, r.status, r.registered_at, r.confirmed_at, r.completed_at,
                COALESCE(r.bank_paid_at, r.stebby_paid_at) AS paid_at,
                e.id AS event_id, e.name AS event_name, e.slug, e.start_date, e.end_date, e.status AS event_status,
                e.payment_link,
                d.name AS division_name
         FROM registrations r
         JOIN events e ON e.id = r.event_id
         JOIN divisions d ON d.id = r.division_id
         WHERE r.player_id = $1
         ORDER BY e.start_date DESC`,
        [req.player.id]
    );
    res.json({ registrations: rows });
}));

// ---------------------------------------------------------------------------
// POST /api/registrations/:eventId/complete
// Mängija ise märgib, et on oma ringi lõpuni märkinud (kutsutakse
// scorecard'ist, kui mängija jõuab viimase raja lõppu). Kasutatakse
// dashboardil "Toimunud võistlused" alla tõstmiseks, ilma et admin
// peaks kogu event'i "finished" staatusesse panema.
// ---------------------------------------------------------------------------
router.post('/:eventId/complete', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `UPDATE registrations SET completed_at = now()
         WHERE event_id = $1 AND player_id = $2 AND completed_at IS NULL
         RETURNING *`,
        [req.params.eventId, req.player.id]
    );
    res.json({ registration: rows[0] || null });
}));

// ---------------------------------------------------------------------------
// DELETE /api/registrations/:id
// Mängija eemaldab ennast ise võistluselt (ainult enda registreerimist,
// ja ainult kuni võistlus pole veel live/lõppenud - kui skoorimine on
// alanud, tuleb pöörduda korraldaja poole).
// ---------------------------------------------------------------------------
router.delete('/:id', asyncHandler(async (req, res) => {
    const { rows: regRows } = await pool.query(
        `SELECT r.*, e.status AS event_status, e.name AS event_name
         FROM registrations r JOIN events e ON e.id = r.event_id
         WHERE r.id = $1`,
        [req.params.id]
    );
    const registration = regRows[0];
    if (!registration) return res.status(404).json({ error: 'Registreerimist ei leitud.' });
    if (registration.player_id !== req.player.id) {
        return res.status(403).json({ error: 'See ei ole sinu registreerimine.' });
    }
    if (['live', 'finished', 'archived'].includes(registration.event_status)) {
        return res.status(400).json({ error: 'Võistlus on juba alanud või lõppenud - registreerimist ei saa enam ise eemaldada. Võta ühendust korraldajaga.' });
    }

    // Teadaolev konks: pool_players.registration_id ei kaskaadi kustutamisel,
    // nii et see tuleb enne käsitsi puhastada.
    await pool.query('DELETE FROM pool_players WHERE registration_id = $1', [req.params.id]);
    await pool.query('DELETE FROM registrations WHERE id = $1', [req.params.id]);

    res.json({ success: true });
}));

module.exports = router;
