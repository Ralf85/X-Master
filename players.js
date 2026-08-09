const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const playerAuth = require('./playerAuth');
const { asyncHandler } = require('./errorHandler');
const { isValidPinFormat, hashPin, comparePin, generateRecoveryCode } = require('./pin');
const { upload } = require('./uploadConfig');

const router = express.Router();

function signPlayerToken(player) {
    return jwt.sign(
        { type: 'player', playerId: player.id, playerNumber: player.player_number },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
    );
}

function publicPlayer(row) {
    // Ei tagasta kunagi pin_hash ega recovery_code_hash
    const { pin_hash, recovery_code_hash, ...safe } = row;
    return safe;
}

// ---------------------------------------------------------------------------
// POST /api/players/register
// Punkt 3: mängija konto loomine ühe korra
// ---------------------------------------------------------------------------
router.post('/register', asyncHandler(async (req, res) => {
    const { firstName, lastName, pin, pinConfirm, pdgaNumber, country, email, phone } = req.body;

    if (!firstName || !lastName) {
        return res.status(400).json({ error: 'Eesnimi ja perekonnanimi on kohustuslikud.' });
    }
    if (!isValidPinFormat(pin)) {
        return res.status(400).json({ error: 'PIN peab olema 4-6 numbrit.' });
    }
    if (pin !== pinConfirm) {
        return res.status(400).json({ error: 'PIN-koodid ei kattu.' });
    }

    const pinHash = await hashPin(pin);

    const { rows } = await pool.query(
        `INSERT INTO players
            (player_number, first_name, last_name, pin_hash, pdga_number, country, email, phone)
         VALUES (nextval('player_number_seq'), $1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [firstName, lastName, pinHash, pdgaNumber || null, country || null, email || null, phone || null]
    );

    const player = rows[0];
    res.status(201).json({ player: publicPlayer(player), token: signPlayerToken(player) });
}));

// ---------------------------------------------------------------------------
// POST /api/players/login
// Punkt 5: Player ID + PIN
// ---------------------------------------------------------------------------
router.post('/login', asyncHandler(async (req, res) => {
    const { playerNumber, pin } = req.body;
    if (!playerNumber || !pin) {
        return res.status(400).json({ error: 'Player ID ja PIN on kohustuslikud.' });
    }

    const { rows } = await pool.query('SELECT * FROM players WHERE player_number = $1', [playerNumber]);
    const player = rows[0];

    if (!player || !(await comparePin(pin, player.pin_hash))) {
        return res.status(401).json({ error: 'Vale Player ID või PIN.' });
    }

    res.json({ player: publicPlayer(player), token: signPlayerToken(player) });
}));

// ---------------------------------------------------------------------------
// POST /api/players/forgot-pin
// Punkt 7: kui email/telefon olemas, saadetakse taastekood
// ---------------------------------------------------------------------------
router.post('/forgot-pin', asyncHandler(async (req, res) => {
    const { playerNumber } = req.body;
    const { rows } = await pool.query('SELECT * FROM players WHERE player_number = $1', [playerNumber]);
    const player = rows[0];

    // Ei paljasta, kas Player ID eksisteerib, vastuse tekst on alati sama
    const genericResponse = { message: 'Kui konto eksisteerib ja sellel on email või telefon, saadeti taastekood.' };

    if (!player || (!player.email && !player.phone)) {
        return res.json(genericResponse);
    }

    const code = generateRecoveryCode();
    const codeHash = await hashPin(code);
    await pool.query('UPDATE players SET recovery_code_hash = $1 WHERE id = $2', [codeHash, player.id]);

    // TODO: siia tuleb päris email/SMS saatmine (nt Resend, Twilio) kui need
    // teenused on valitud. MVP jaoks logime koodi serveri logisse, et saaksid testida.
    console.log(`[FORGOT PIN] Player ${player.player_number} taastekood: ${code}`);

    res.json(genericResponse);
}));

// ---------------------------------------------------------------------------
// POST /api/players/reset-pin
// ---------------------------------------------------------------------------
router.post('/reset-pin', asyncHandler(async (req, res) => {
    const { playerNumber, recoveryCode, newPin, newPinConfirm } = req.body;

    if (!isValidPinFormat(newPin) || newPin !== newPinConfirm) {
        return res.status(400).json({ error: 'Uus PIN peab olema 4-6 numbrit ja kattuma kinnitusega.' });
    }

    const { rows } = await pool.query('SELECT * FROM players WHERE player_number = $1', [playerNumber]);
    const player = rows[0];

    if (!player || !(await comparePin(recoveryCode, player.recovery_code_hash))) {
        return res.status(401).json({ error: 'Vale Player ID või taastekood.' });
    }

    const newPinHash = await hashPin(newPin);
    await pool.query(
        'UPDATE players SET pin_hash = $1, recovery_code_hash = NULL WHERE id = $2',
        [newPinHash, player.id]
    );

    res.json({ message: 'PIN on uuendatud. Palun logi uue PIN-iga sisse.' });
}));

// ---------------------------------------------------------------------------
// GET /api/players/me
// ---------------------------------------------------------------------------
router.get('/me', playerAuth, asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM players WHERE id = $1', [req.player.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Mängijat ei leitud.' });
    res.json({ player: publicPlayer(rows[0]) });
}));

// ---------------------------------------------------------------------------
// PATCH /api/players/me
// Punkt 8: mitte-tundlike profiiliväljade muutmine
// ---------------------------------------------------------------------------
router.patch('/me', playerAuth, asyncHandler(async (req, res) => {
    const { phone, email, country, pdgaNumber, profileImageUrl,
            wantsEventNotifications, wantsMarketingNotifications } = req.body;

    const { rows } = await pool.query(
        `UPDATE players SET
            phone = COALESCE($1, phone),
            email = COALESCE($2, email),
            country = COALESCE($3, country),
            pdga_number = COALESCE($4, pdga_number),
            profile_image_url = COALESCE($5, profile_image_url),
            wants_event_notifications = COALESCE($6, wants_event_notifications),
            wants_marketing_notifications = COALESCE($7, wants_marketing_notifications)
         WHERE id = $8
         RETURNING *`,
        [phone, email, country, pdgaNumber, profileImageUrl,
         wantsEventNotifications, wantsMarketingNotifications, req.player.id]
    );

    res.json({ player: publicPlayer(rows[0]) });
}));

// ---------------------------------------------------------------------------
// POST /api/players/me/change-pin
// Punkt 8: PIN-i muutmine nõuab vana PIN-i kinnitust
// ---------------------------------------------------------------------------
router.post('/me/change-pin', playerAuth, asyncHandler(async (req, res) => {
    const { currentPin, newPin, newPinConfirm } = req.body;

    if (!isValidPinFormat(newPin) || newPin !== newPinConfirm) {
        return res.status(400).json({ error: 'Uus PIN peab olema 4-6 numbrit ja kattuma kinnitusega.' });
    }

    const { rows } = await pool.query('SELECT pin_hash FROM players WHERE id = $1', [req.player.id]);
    if (!(await comparePin(currentPin, rows[0]?.pin_hash))) {
        return res.status(401).json({ error: 'Praegune PIN on vale.' });
    }

    const newPinHash = await hashPin(newPin);
    await pool.query('UPDATE players SET pin_hash = $1 WHERE id = $2', [newPinHash, req.player.id]);
    res.json({ message: 'PIN on uuendatud.' });
}));

// ---------------------------------------------------------------------------
// POST /api/players/me/profile-image
// Punkt 9: profiilipildi üleslaadimine, max 5MB, PNG/JPG/WEBP
// ---------------------------------------------------------------------------
router.post('/me/profile-image', playerAuth, upload.single('image'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Pilti ei leitud.' });

    const publicUrl = `/uploads/${req.file.filename}`;
    const { rows } = await pool.query(
        'UPDATE players SET profile_image_url = $1 WHERE id = $2 RETURNING *',
        [publicUrl, req.player.id]
    );
    res.json({ player: publicPlayer(rows[0]) });
}));

// Multer viskab faili-vea (nt liiga suur, vale tüüp) enne meie handlerini jõudmist -
// see eraldi error handler püüab selle kinni ja vormistab korralikult.
router.use('/me/profile-image', (err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Fail on liiga suur. Maksimaalne suurus on 5MB.' });
    }
    res.status(400).json({ error: err.message || 'Faili üleslaadimine ebaõnnestus.' });
});

// ---------------------------------------------------------------------------
// DELETE /api/players/me/profile-image
// Punkt 9: "EEMALDA PILT"
// ---------------------------------------------------------------------------
router.delete('/me/profile-image', playerAuth, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        'UPDATE players SET profile_image_url = NULL WHERE id = $1 RETURNING *',
        [req.player.id]
    );
    res.json({ player: publicPlayer(rows[0]) });
}));

module.exports = router;
