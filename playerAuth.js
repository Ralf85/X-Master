const jwt = require('jsonwebtoken');

// Kontrollib mängija sessiooni tokenit (saadud /api/players/login vastuses).
// Kasutatakse tavaliste, mitte-tundlike tegevuste jaoks (profiili vaatamine jms).
// Tundlike tegevuste jaoks (registreerimise kinnitus, PIN-muutus) küsitakse PIN
// eraldi endpoint'i body's, mitte ainult tokeni olemasolu põhjal.
function playerAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Autentimine puudub. Palun logi sisse.' });
    }

    const token = header.slice('Bearer '.length);
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.type !== 'player') {
            return res.status(403).json({ error: 'Vale tokeni tüüp.' });
        }
        req.player = { id: payload.playerId, playerNumber: payload.playerNumber };
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token on aegunud või kehtetu. Palun logi uuesti sisse.' });
    }
}

module.exports = playerAuth;
