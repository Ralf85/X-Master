// Igasse route'i ei pea kirjutama try/catch'i, kui kasutad asyncHandler'it
// ja viskad Error objekti - see middleware püüab selle kinni ja vormistab vastuse.
function errorHandler(err, req, res, next) {
    console.error(err);

    if (err.code === '23505') {
        // Postgres unique constraint violation
        return res.status(409).json({ error: 'Selline kirje on juba olemas.' });
    }
    if (err.code === '23503') {
        // Postgres foreign key violation
        return res.status(400).json({ error: 'Viidatud kirjet ei leitud.' });
    }

    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Serveri sisemine viga.' });
}

// Wrapper, et async route handler'ites visatud errorid jõuaksid errorHandler'ini
function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, asyncHandler };
