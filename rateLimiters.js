const rateLimit = require('express-rate-limit');

// Sisselogimine (PIN, admin parool) - lubame väikese arvu katseid IP kohta,
// et takistada PIN-koodi läbiproovimist (4-6 numbrit on väike ruum).
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Liiga palju katseid. Palun oota 15 minutit ja proovi uuesti.' },
});

// PIN taastamine/lähtestamine - samuti piiratud, et koodi ei saaks läbi proovida.
const recoveryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Liiga palju katseid. Palun oota 15 minutit ja proovi uuesti.' },
});

// Kontoloomine - leebem, aga siiski piiratud (takistab masskonto loomist).
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1h
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Liiga palju kontoloomise katseid sellelt aadressilt. Palun proovi hiljem uuesti.' },
});

module.exports = { loginLimiter, recoveryLimiter, registerLimiter };
