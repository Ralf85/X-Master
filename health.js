const express = require('express');
const pool = require('./db');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
        console.error('Health check andmebaasi viga:', err);
        const nested = Array.isArray(err.errors)
            ? err.errors.map((e) => e.message || e.code || String(e))
            : undefined;
        res.status(500).json({
            status: 'error',
            database: 'disconnected',
            detail: err.message || null,
            code: err.code || null,
            nested: nested || null,
            hasConnectionString: Boolean(process.env.DATABASE_URL),
        });
    }
});

module.exports = router;
