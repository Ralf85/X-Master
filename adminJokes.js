const express = require('express');
const pool = require('./db');
const { adminAuth } = require('./adminAuth');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();
router.use(adminAuth);

// ---------------------------------------------------------------------------
// GET /api/admin/jokes
// ---------------------------------------------------------------------------
router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM joke_templates ORDER BY created_at DESC');
    res.json({ jokes: rows });
}));

// ---------------------------------------------------------------------------
// POST /api/admin/jokes
// body: { templateText, holeNumber? } - kasuta {P1}, {P2}, {P3}, {P4}... kohatäitjaid
// holeNumber valikuline: kui määratud, kuvatakse ainult sellel rajal.
// ---------------------------------------------------------------------------
router.post('/', asyncHandler(async (req, res) => {
    const { templateText, holeNumber } = req.body;
    if (!templateText || !templateText.trim()) {
        return res.status(400).json({ error: 'Anekdoodi tekst ei tohi olla tühi.' });
    }
    const { rows } = await pool.query(
        'INSERT INTO joke_templates (template_text, hole_number) VALUES ($1, $2) RETURNING *',
        [templateText.trim(), holeNumber || null]
    );
    res.status(201).json({ joke: rows[0] });
}));

// ---------------------------------------------------------------------------
// DELETE /api/admin/jokes/:id
// ---------------------------------------------------------------------------
router.delete('/:id', asyncHandler(async (req, res) => {
    const { rows } = await pool.query('DELETE FROM joke_templates WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Anekdooti ei leitud.' });
    res.json({ message: 'Kustutatud.' });
}));

module.exports = router;
