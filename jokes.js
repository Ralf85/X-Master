const express = require('express');
const pool = require('./db');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/jokes/random?holeNumber=N
// Avalik - anekdoodi-mall raja-lõpu vaatele.
// Kui sellel konkreetsel rajal on eraldi määratud anekdoot(e), valitakse
// juhuslikult NENDE seast (garanteeritult). Muidu langetakse üldisesse
// (hole_number IS NULL) juhuslikku valikusse.
// ---------------------------------------------------------------------------
router.get('/random', asyncHandler(async (req, res) => {
    const holeNumber = req.query.holeNumber ? parseInt(req.query.holeNumber, 10) : null;

    if (holeNumber) {
        const { rows: holeSpecific } = await pool.query(
            'SELECT id, template_text FROM joke_templates WHERE hole_number = $1 ORDER BY random() LIMIT 1',
            [holeNumber]
        );
        if (holeSpecific[0]) return res.json({ joke: holeSpecific[0] });
    }

    const { rows } = await pool.query(
        'SELECT id, template_text FROM joke_templates WHERE hole_number IS NULL ORDER BY random() LIMIT 1'
    );
    res.json({ joke: rows[0] || null });
}));

module.exports = router;
