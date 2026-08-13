const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const playerAuth = require('./playerAuth');
const { asyncHandler } = require('./errorHandler');
const { isValidPinFormat, hashPin, comparePin, generateRecoveryCode } = require('./pin');
const { upload } = require('./uploadConfig');
const { loginLimiter, recoveryLimiter, registerLimiter } = require('./rateLimiters');
const { sendRecoveryEmail } = require('./email');

const router = express.Router();

function signPlayerToken(player) {
    return jwt.sign(
        { type: 'player', playerId: player.id, playerNumber: player.player_number },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
    );
}

function publicPlayer(row) {
    // Ei tagasta kunagi pin_hash, recovery_code_hash ega toorest pildi binaari
    const { pin_hash, recovery_code_hash, profile_image_data, profile_image_mimetype, ...safe } = row;
    return safe;
}

// ---------------------------------------------------------------------------
// POST /api/players/register
// Punkt 3: mängija konto loomine ühe korra
// ---------------------------------------------------------------------------
router.post('/register', registerLimiter, asyncHandler(async (req, res) => {
    const { firstName, lastName, pin, pinConfirm, pdgaNumber, country, email, phone, birthDate, gender } = req.body;

    if (!firstName || !lastName) {
        return res.status(400).json({ error: 'Eesnimi ja perekonnanimi on kohustuslikud.' });
    }
    if (!email || !email.trim()) {
        return res.status(400).json({ error: 'Email on kohustuslik.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ error: 'Email ei ole korrektses vormingus.' });
    }
    if (!isValidPinFormat(pin)) {
        return res.status(400).json({ error: 'PIN peab olema 4-6 numbrit.' });
    }
    if (pin !== pinConfirm) {
        return res.status(400).json({ error: 'PIN-koodid ei kattu.' });
    }
    if (!birthDate) {
        return res.status(400).json({ error: 'Sünniaeg on kohustuslik.' });
    }
    if (!gender || !['M', 'N'].includes(gender)) {
        return res.status(400).json({ error: 'Sugu on kohustuslik (mees/naine).' });
    }

    const pinHash = await hashPin(pin);

    const { rows } = await pool.query(
        `INSERT INTO players
            (player_number, first_name, last_name, pin_hash, pdga_number, country, email, phone, birth_date, gender)
         VALUES (nextval('player_number_seq'), $1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [firstName, lastName, pinHash, pdgaNumber || null, country || null, email || null, phone || null, birthDate, gender]
    );

    const player = rows[0];
    res.status(201).json({ player: publicPlayer(player), token: signPlayerToken(player) });
}));

// ---------------------------------------------------------------------------
// POST /api/players/login
// Punkt 5: Player ID + PIN
// ---------------------------------------------------------------------------
router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
    const { identifier, pin } = req.body;
    if (!identifier || !pin) {
        return res.status(400).json({ error: 'Player ID/email ja PIN on kohustuslikud.' });
    }

    const trimmed = String(identifier).trim();
    const isEmail = trimmed.includes('@');
    const { rows } = isEmail
        ? await pool.query('SELECT * FROM players WHERE LOWER(email) = LOWER($1)', [trimmed])
        : await pool.query('SELECT * FROM players WHERE player_number = $1', [trimmed]);
    const player = rows[0];

    // Konto-põhine lukk (lisaks IP-põhisele rate limiter'ile) - takistab
    // PIN-i läbiproovimist ka siis, kui ründaja kasutab mitut erinevat IP-d
    // (nt VPN/proxy), kuna lukk on seotud konkreetse kontoga, mitte IP-ga.
    if (player && player.locked_until && new Date(player.locked_until) > new Date()) {
        const minutesLeft = Math.ceil((new Date(player.locked_until) - new Date()) / 60000);
        return res.status(429).json({ error: `Liiga palju valesid katseid. Konto on ajutiselt lukus - proovi uuesti ${minutesLeft} min pärast, või taasta PIN emailiga.` });
    }

    const pinOk = player && (await comparePin(pin, player.pin_hash));

    if (!pinOk) {
        if (player) {
            const attempts = (player.failed_login_attempts || 0) + 1;
            const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
            await pool.query(
                'UPDATE players SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
                [attempts, lockUntil, player.id]
            );
        }
        return res.status(401).json({ error: 'Vale Player ID/email või PIN.' });
    }

    if (player.failed_login_attempts > 0 || player.locked_until) {
        await pool.query('UPDATE players SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [player.id]);
    }

    res.json({ player: publicPlayer(player), token: signPlayerToken(player) });
}));

// ---------------------------------------------------------------------------
// POST /api/players/forgot-pin
// Punkt 7: kui email/telefon olemas, saadetakse taastekood
// ---------------------------------------------------------------------------
router.post('/forgot-pin', recoveryLimiter, asyncHandler(async (req, res) => {
    const identifier = String(req.body.identifier || req.body.playerNumber || req.body.email || '').trim();
    const genericResponse = { message: 'Kui konto eksisteerib ja sellel on email, saadeti taastekood emailile.' };
    if (!identifier) return res.json(genericResponse);

    const isEmail = identifier.includes('@');
    const { rows } = isEmail
        ? await pool.query('SELECT * FROM players WHERE LOWER(email) = LOWER($1)', [identifier])
        : await pool.query('SELECT * FROM players WHERE player_number = $1', [identifier]);
    const player = rows[0];

    // Ei paljasta, kas konto eksisteerib - vastuse tekst on alati sama
    if (!player || !player.email) {
        return res.json(genericResponse);
    }

    const code = generateRecoveryCode();
    const codeHash = await hashPin(code);
    await pool.query('UPDATE players SET recovery_code_hash = $1 WHERE id = $2', [codeHash, player.id]);

    await sendRecoveryEmail({ to: player.email, playerNumber: player.player_number, recoveryCode: code });

    res.json(genericResponse);
}));

// ---------------------------------------------------------------------------
// POST /api/players/reset-pin
// ---------------------------------------------------------------------------
router.post('/reset-pin', recoveryLimiter, asyncHandler(async (req, res) => {
    const identifier = String(req.body.identifier || req.body.playerNumber || '').trim();
    const { recoveryCode, newPin, newPinConfirm } = req.body;

    if (!isValidPinFormat(newPin) || newPin !== newPinConfirm) {
        return res.status(400).json({ error: 'Uus PIN peab olema 4-6 numbrit ja kattuma kinnitusega.' });
    }

    const isEmail = identifier.includes('@');
    const { rows } = isEmail
        ? await pool.query('SELECT * FROM players WHERE LOWER(email) = LOWER($1)', [identifier])
        : await pool.query('SELECT * FROM players WHERE player_number = $1', [identifier]);
    const player = rows[0];

    if (!player || !(await comparePin(recoveryCode, player.recovery_code_hash))) {
        return res.status(401).json({ error: 'Vale Player ID/email või taastekood.' });
    }

    const newPinHash = await hashPin(newPin);
    await pool.query(
        'UPDATE players SET pin_hash = $1, recovery_code_hash = NULL, failed_login_attempts = 0, locked_until = NULL WHERE id = $2',
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
    const { firstName, lastName, phone, email, country, pdgaNumber, profileImageUrl,
            wantsEventNotifications, wantsMarketingNotifications, birthDate, gender } = req.body;

    if (firstName !== undefined && !firstName.trim()) {
        return res.status(400).json({ error: 'Eesnimi ei tohi olla tühi.' });
    }
    if (lastName !== undefined && !lastName.trim()) {
        return res.status(400).json({ error: 'Perekonnanimi ei tohi olla tühi.' });
    }
    if (gender !== undefined && gender !== null && !['M', 'N'].includes(gender)) {
        return res.status(400).json({ error: 'Sugu peab olema M või N.' });
    }

    const { rows } = await pool.query(
        `UPDATE players SET
            first_name = COALESCE($1, first_name),
            last_name = COALESCE($2, last_name),
            phone = COALESCE($3, phone),
            email = COALESCE($4, email),
            country = COALESCE($5, country),
            pdga_number = COALESCE($6, pdga_number),
            profile_image_url = COALESCE($7, profile_image_url),
            wants_event_notifications = COALESCE($8, wants_event_notifications),
            wants_marketing_notifications = COALESCE($9, wants_marketing_notifications),
            birth_date = COALESCE($10, birth_date),
            gender = COALESCE($11, gender)
         WHERE id = $12
         RETURNING *`,
        [firstName, lastName, phone, email, country, pdgaNumber, profileImageUrl,
         wantsEventNotifications, wantsMarketingNotifications, birthDate, gender, req.player.id]
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
// Punkt 9: profiilipildi üleslaadimine, max 5MB, PNG/JPG/WEBP.
// Pilt salvestatakse otse andmebaasi (mitte failisüsteemi), et vältida
// sõltuvust Railway Volume seadistusest.
// ---------------------------------------------------------------------------
router.post('/me/profile-image', playerAuth, upload.single('image'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Pilti ei leitud.' });

    const publicUrl = `/api/players/${req.player.id}/profile-image?v=${Date.now()}`;
    const { rows } = await pool.query(
        `UPDATE players SET profile_image_url = $1, profile_image_data = $2, profile_image_mimetype = $3
         WHERE id = $4 RETURNING *`,
        [publicUrl, req.file.buffer, req.file.mimetype, req.player.id]
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
// GET /api/players/:playerId/profile-image
// Avalik (ei nõua sisselogimist, nt leaderboard'il kuvamiseks). Loeb pildi
// otse andmebaasist ja saadab selle õige Content-Type'iga.
// ---------------------------------------------------------------------------
router.get('/:playerId/profile-image', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        'SELECT profile_image_data, profile_image_mimetype FROM players WHERE id = $1',
        [req.params.playerId]
    );
    if (!rows[0] || !rows[0].profile_image_data) return res.status(404).send('Pilti ei leitud.');
    res.set('Content-Type', rows[0].profile_image_mimetype);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].profile_image_data);
}));

// ---------------------------------------------------------------------------
// DELETE /api/players/me/profile-image
// Punkt 9: "EEMALDA PILT"
// ---------------------------------------------------------------------------
router.delete('/me/profile-image', playerAuth, asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `UPDATE players SET profile_image_url = NULL, profile_image_data = NULL, profile_image_mimetype = NULL
         WHERE id = $1 RETURNING *`,
        [req.player.id]
    );
    res.json({ player: publicPlayer(rows[0]) });
}));

module.exports = router;
