const express = require('express');
const pool = require('./db');
const { adminAuth } = require('./adminAuth');
const { asyncHandler } = require('./errorHandler');

const router = express.Router();
router.use(adminAuth);

// ---------------------------------------------------------------------------
// EVENTS (punktid 48-49)
// ---------------------------------------------------------------------------
router.post('/', asyncHandler(async (req, res) => {
    const { name, slug, location, startDate, endDate, registrationStart,
            registrationEnd, registrationLimit, logoUrl, brandingTheme } = req.body;

    if (!name || !slug || !startDate || !endDate) {
        return res.status(400).json({ error: 'name, slug, startDate ja endDate on kohustuslikud.' });
    }

    const { rows } = await pool.query(
        `INSERT INTO events
            (name, slug, location, start_date, end_date, registration_start,
             registration_end, registration_limit, logo_url, branding_theme, organizer_admin_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [name, slug, location || null, startDate, endDate, registrationStart || null,
         registrationEnd || null, registrationLimit || null, logoUrl || null,
         JSON.stringify(brandingTheme || {}), req.admin.id]
    );
    const event = rows[0];

    // Iga uus võistlus saab kohe kaks divisjoni valmis (Mehed/Naised), et
    // registreerimisel saaks mängija soo põhjal automaatselt siduda.
    await pool.query(
        `INSERT INTO divisions (event_id, name, gender, sort_order) VALUES
            ($1, 'Mehed', 'M', 0), ($1, 'Naised', 'N', 1)`,
        [event.id]
    );

    res.status(201).json({ event });
}));

router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM events ORDER BY start_date DESC');
    res.json({ events: rows });
}));

router.get('/:id', asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Võistlust ei leitud.' });

    const [divisions, parks, rounds] = await Promise.all([
        pool.query('SELECT * FROM divisions WHERE event_id = $1 ORDER BY sort_order', [req.params.id]),
        pool.query('SELECT * FROM parks WHERE event_id = $1 ORDER BY sort_order', [req.params.id]),
        pool.query('SELECT * FROM rounds WHERE event_id = $1 ORDER BY round_number', [req.params.id]),
    ]);

    res.json({ event: rows[0], divisions: divisions.rows, parks: parks.rows, rounds: rounds.rows });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
    const { name, location, startDate, endDate, registrationStart, registrationEnd,
            registrationLimit, logoUrl, brandingTheme, status } = req.body;

    const validStatuses = ['draft', 'registration_open', 'registration_closed', 'live', 'finished', 'archived'];
    if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: `status peab olema \u00fcks: ${validStatuses.join(', ')}` });
    }

    const { rows } = await pool.query(
        `UPDATE events SET
            name = COALESCE($1, name),
            location = COALESCE($2, location),
            start_date = COALESCE($3, start_date),
            end_date = COALESCE($4, end_date),
            registration_start = COALESCE($5, registration_start),
            registration_end = COALESCE($6, registration_end),
            registration_limit = COALESCE($7, registration_limit),
            logo_url = COALESCE($8, logo_url),
            branding_theme = COALESCE($9, branding_theme),
            status = COALESCE($10, status)
         WHERE id = $11
         RETURNING *`,
        [name, location, startDate, endDate, registrationStart, registrationEnd,
         registrationLimit, logoUrl, brandingTheme ? JSON.stringify(brandingTheme) : null,
         status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Võistlust ei leitud.' });
    res.json({ event: rows[0] });
}));

// ---------------------------------------------------------------------------
// DELETE /api/admin/events/:id
// Kustutab võistluse ja kõik seotud andmed. Score-tabelid pole event'ilt
// automaatse CASCADE peal (round_id kaudu), nii et need tuleb enne käsitsi
// puhastada, muidu ebaõnnestub kustutamine, kui event'il on juba tulemusi.
// ---------------------------------------------------------------------------
router.delete('/:id', asyncHandler(async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: roundRows } = await client.query('SELECT id FROM rounds WHERE event_id = $1', [req.params.id]);
        const roundIds = roundRows.map((r) => r.id);

        if (roundIds.length > 0) {
            await client.query('DELETE FROM score_audit_log WHERE round_id = ANY($1::int[])', [roundIds]);
            await client.query('DELETE FROM score_conflicts WHERE round_id = ANY($1::int[])', [roundIds]);
            await client.query('DELETE FROM official_scores WHERE round_id = ANY($1::int[])', [roundIds]);
            await client.query('DELETE FROM score_entries WHERE round_id = ANY($1::int[])', [roundIds]);
            // holes.park_id ei ole CASCADE peal - kustuta enne, muidu blokeerib parkide kustutamist
            await client.query('DELETE FROM holes WHERE round_id = ANY($1::int[])', [roundIds]);
            // pools.division_id ja registrations.division_id ei ole CASCADE peal,
            // nii et need tuleb enne divisjonide (ja event'i) kustutamist käsitsi eemaldada.
            await client.query('DELETE FROM pool_players WHERE pool_id IN (SELECT id FROM pools WHERE round_id = ANY($1::int[]))', [roundIds]);
            await client.query('DELETE FROM pools WHERE round_id = ANY($1::int[])', [roundIds]);
        }
        await client.query('DELETE FROM registrations WHERE event_id = $1', [req.params.id]);

        const { rows } = await client.query('DELETE FROM events WHERE id = $1 RETURNING id, name', [req.params.id]);
        if (!rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Võistlust ei leitud.' });
        }

        await client.query('COMMIT');
        res.json({ message: 'Võistlus kustutatud.', event: rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// ---------------------------------------------------------------------------
// DIVISIONS (punkt 50)
// ---------------------------------------------------------------------------
router.post('/:id/divisions', asyncHandler(async (req, res) => {
    const { name, gender, sortOrder } = req.body;
    if (!name) return res.status(400).json({ error: 'name on kohustuslik.' });
    if (gender !== undefined && gender !== null && !['M', 'N'].includes(gender)) {
        return res.status(400).json({ error: 'gender peab olema M, N või tühi.' });
    }

    const { rows } = await pool.query(
        `INSERT INTO divisions (event_id, name, gender, sort_order) VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.params.id, name, gender || null, sortOrder || 0]
    );
    res.status(201).json({ division: rows[0] });
}));

router.patch('/divisions/:divisionId', asyncHandler(async (req, res) => {
    const { gender } = req.body;
    if (gender !== undefined && gender !== null && !['M', 'N'].includes(gender)) {
        return res.status(400).json({ error: 'gender peab olema M, N või tühi.' });
    }
    const { rows } = await pool.query(
        'UPDATE divisions SET gender = $1 WHERE id = $2 RETURNING *',
        [gender || null, req.params.divisionId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Divisjoni ei leitud.' });
    res.json({ division: rows[0] });
}));

router.delete('/divisions/:divisionId', asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM divisions WHERE id = $1', [req.params.divisionId]);
    res.json({ message: 'Divisjon kustutatud.' });
}));

// ---------------------------------------------------------------------------
// POST /api/admin/events/:id/ensure-gender-divisions
// Kiirparandus: tagab, et sellel event'il on olemas soo-märgendiga
// "Mehed" ja "Naised" divisjonid. Kui need juba nime järgi eksisteerivad
// aga ilma soo-märgendita, lisatakse märgend; kui puuduvad täielikult,
// luuakse need.
// ---------------------------------------------------------------------------
router.post('/:id/ensure-gender-divisions', asyncHandler(async (req, res) => {
    const { rows: existing } = await pool.query(
        'SELECT * FROM divisions WHERE event_id = $1', [req.params.id]
    );

    const hasMenTagged = existing.some((d) => d.gender === 'M');
    const hasWomenTagged = existing.some((d) => d.gender === 'N');
    const untaggedMen = existing.find((d) => d.name === 'Mehed' && !d.gender);
    const untaggedWomen = existing.find((d) => d.name === 'Naised' && !d.gender);

    if (untaggedMen) {
        await pool.query('UPDATE divisions SET gender = $1 WHERE id = $2', ['M', untaggedMen.id]);
    } else if (!hasMenTagged) {
        await pool.query(
            'INSERT INTO divisions (event_id, name, gender, sort_order) VALUES ($1, $2, $3, $4)',
            [req.params.id, 'Mehed', 'M', existing.length]
        );
    }

    if (untaggedWomen) {
        await pool.query('UPDATE divisions SET gender = $1 WHERE id = $2', ['N', untaggedWomen.id]);
    } else if (!hasWomenTagged) {
        await pool.query(
            'INSERT INTO divisions (event_id, name, gender, sort_order) VALUES ($1, $2, $3, $4)',
            [req.params.id, 'Naised', 'N', existing.length + 1]
        );
    }

    const { rows: finalDivisions } = await pool.query(
        'SELECT * FROM divisions WHERE event_id = $1 ORDER BY sort_order', [req.params.id]
    );
    res.json({ divisions: finalDivisions });
}));

// ---------------------------------------------------------------------------
// PARKS / SECTORS (punkt 51)
// ---------------------------------------------------------------------------
router.post('/:id/parks', asyncHandler(async (req, res) => {
    const { name, color, icon, sponsor, sortOrder } = req.body;
    if (!name) return res.status(400).json({ error: 'name on kohustuslik.' });

    const { rows } = await pool.query(
        `INSERT INTO parks (event_id, name, color, icon, sponsor, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.params.id, name, color || null, icon || null, sponsor || null, sortOrder || 0]
    );
    res.status(201).json({ park: rows[0] });
}));

router.delete('/parks/:parkId', asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM parks WHERE id = $1', [req.params.parkId]);
    res.json({ message: 'Park kustutatud.' });
}));

// ---------------------------------------------------------------------------
// ROUNDS
// ---------------------------------------------------------------------------
router.post('/:id/rounds', asyncHandler(async (req, res) => {
    const { roundNumber, name, roundDate } = req.body;
    if (!roundNumber) return res.status(400).json({ error: 'roundNumber on kohustuslik.' });

    const { rows } = await pool.query(
        `INSERT INTO rounds (event_id, round_number, name, round_date)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.params.id, roundNumber, name || `Round ${roundNumber}`, roundDate || null]
    );
    res.status(201).json({ round: rows[0] });
}));

// ---------------------------------------------------------------------------
// HOLES (punkt 52) - massiline lisamine korraga
// ---------------------------------------------------------------------------
router.post('/rounds/:roundId/holes', asyncHandler(async (req, res) => {
    const { holes } = req.body; // [{ holeNumber, par, lengthMeters, parkId, sortOrder }, ...]
    if (!Array.isArray(holes) || holes.length === 0) {
        return res.status(400).json({ error: 'holes peab olema mittetühi massiiv.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const inserted = [];
        for (const h of holes) {
            const { rows } = await client.query(
                `INSERT INTO holes (round_id, park_id, hole_number, par, length_meters, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [req.params.roundId, h.parkId || null, h.holeNumber, h.par || 3,
                 h.lengthMeters || null, h.sortOrder ?? h.holeNumber]
            );
            inserted.push(rows[0]);
        }
        await client.query('COMMIT');
        res.status(201).json({ holes: inserted });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

router.get('/rounds/:roundId/holes', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        'SELECT * FROM holes WHERE round_id = $1 ORDER BY sort_order',
        [req.params.roundId]
    );
    res.json({ holes: rows });
}));

router.delete('/holes/:holeId', asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM holes WHERE id = $1', [req.params.holeId]);
    res.json({ message: 'Rada kustutatud.' });
}));

router.patch('/holes/:holeId', asyncHandler(async (req, res) => {
    const { holeNumber, par, parkId, lengthMeters } = req.body;
    const { rows } = await pool.query(
        `UPDATE holes SET
            hole_number = COALESCE($1, hole_number),
            par = COALESCE($2, par),
            park_id = COALESCE($3, park_id),
            length_meters = COALESCE($4, length_meters)
         WHERE id = $5
         RETURNING *`,
        [holeNumber, par, parkId, lengthMeters, req.params.holeId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Rada ei leitud.' });
    res.json({ hole: rows[0] });
}));

module.exports = router;
