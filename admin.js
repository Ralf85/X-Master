const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const { adminAuth } = require('./adminAuth');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /api/admin/login
// Punkt 44: admin kasutab tugevamat autentimist (email + parool)
// ---------------------------------------------------------------------------
router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email ja parool on kohustuslikud.' });
    }

    const { rows } = await pool.query(
        'SELECT * FROM admins WHERE email = $1 AND is_active = TRUE',
        [email]
    );
    const admin = rows[0];

    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
        return res.status(401).json({ error: 'Vale email või parool.' });
    }

    const token = jwt.sign(
        { type: 'admin', adminId: admin.id, role: admin.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );

    res.json({
        admin: { id: admin.id, email: admin.email, fullName: admin.full_name, role: admin.role },
        token,
    });
}));

// ---------------------------------------------------------------------------
// GET /api/admin/me
// ---------------------------------------------------------------------------
router.get('/me', adminAuth, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        'SELECT id, email, full_name, role FROM admins WHERE id = $1',
        [req.admin.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Adminit ei leitud.' });
    res.json({ admin: rows[0] });
}));

module.exports = router;
