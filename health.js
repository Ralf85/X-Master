const express = require('express');
const pool = require('./db');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
        console.error('Health check andmebaasi viga:', err);
        res.status(500).json({ status: 'error', database: 'disconnected', detail: err.message });
    }
});

module.exports = router;
