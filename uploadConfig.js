const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Kui Railway'l on Volume külge lisatud (nt mount path /data), sea keskkonnamuutuja
// UPLOAD_DIR=/data/uploads - siis jäävad pildid alles ka deploy'ide vahel.
// Kui UPLOAD_DIR pole seatud, kasutatakse projekti enda kausta (KAOB järgmise deploy'iga!).
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `player-${req.player.id}-${Date.now()}${ext}`);
    },
});

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB, punkt 9 spec'ist
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_TYPES.includes(file.mimetype)) {
            return cb(new Error('Lubatud on ainult PNG, JPG või WEBP failid.'));
        }
        cb(null, true);
    },
});

module.exports = { upload, UPLOAD_DIR };
