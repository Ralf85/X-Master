const multer = require('multer');

// Pilt läheb otse andmebaasi (vt players.js), mitte kettale - seega
// kasutame memoryStorage'i, ei ole vaja UPLOAD_DIR'i ega Railway Volume'it.
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB, punkt 9 spec'ist
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_TYPES.includes(file.mimetype)) {
            return cb(new Error('Lubatud on ainult PNG, JPG või WEBP failid.'));
        }
        cb(null, true);
    },
});

module.exports = { upload };
