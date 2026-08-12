const express = require('express');
const pool = require('./db');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/jokes/random?eventId=N&holeNumber=N
// Avalik - anekdoodi-mall raja-lõpu vaatele. Ainult SELLE event'i anekdoodid.
// Kui sellel konkreetsel rajal on eraldi määratud anekdoot(e), valitakse
// juhuslikult NENDE seast (garanteeritult, ei "kulu ära" - jääb sinna alati).
// Muidu langetakse üldisesse (hole_number IS NULL) valikusse, aga iga
// üldine anekdoot näidatakse ainult ÜKS KORD - kui näidatud, ei tule enam.
// ---------------------------------------------------------------------------
router.get('/random', asyncHandler(async (req, res) => {
    const eventId = req.query.eventId ? parseInt(req.query.eventId, 10) : null;
    if (!eventId) return res.json({ joke: null });
    const holeNumber = req.query.holeNumber ? parseInt(req.query.holeNumber, 10) : null;

    if (holeNumber) {
        const { rows: holeSpecific } = await pool.query(
            'SELECT id, template_text FROM joke_templates WHERE event_id = $1 AND hole_number = $2 ORDER BY random() LIMIT 1',
            [eventId, holeNumber]
        );
        if (holeSpecific[0]) return res.json({ joke: holeSpecific[0] });
    }

    // Vali juhuslik VEEL NÄITAMATA üldine anekdoot (selle event'i seest) ja
    // märgi see kohe "kasutatuks" - üks atomaarne käsk, et vältida kahe
    // samaaegse pooli poolt sama anekdoodi kättesaamist.
    const { rows } = await pool.query(
        `UPDATE joke_templates SET used_at = now()
         WHERE id = (
             SELECT id FROM joke_templates
             WHERE event_id = $1 AND hole_number IS NULL AND used_at IS NULL
             ORDER BY random() LIMIT 1
             FOR UPDATE SKIP LOCKED
         )
         RETURNING id, template_text`,
        [eventId]
    );
    res.json({ joke: rows[0] || null });
}));

module.exports = router;
