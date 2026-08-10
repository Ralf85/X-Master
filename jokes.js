const express = require('express');
const pool = require('./db');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/jokes/random
// Avalik - juhuslik anekdoodi-mall raja-lõpu vaatele.
// ---------------------------------------------------------------------------
router.get('/random', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        'SELECT id, template_text FROM joke_templates ORDER BY random() LIMIT 1'
    );
    res.json({ joke: rows[0] || null });
}));

module.exports = router;
