const jwt = require('jsonwebtoken');

function adminAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Autentimine puudub.' });
    }

    const token = header.slice('Bearer '.length);
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.type !== 'admin') {
            return res.status(403).json({ error: 'Vale tokeni tüüp.' });
        }
        req.admin = { id: payload.adminId, role: payload.role };
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token on aegunud või kehtetu. Palun logi uuesti sisse.' });
    }
}

// Kasutatakse route'idel, mis nõuavad super_admin õigust
function requireSuperAdmin(req, res, next) {
    if (req.admin?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Selleks on vaja super admin õigusi.' });
    }
    next();
}

module.exports = { adminAuth, requireSuperAdmin };
