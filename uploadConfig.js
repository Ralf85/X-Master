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

// Event'i juhendi dokument (PDF, Word, pilt) - läheb samuti otse
// andmebaasi (bytea), sama muster mis profiilipildil.
const ALLOWED_GUIDE_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/png', 'image/webp',
];

const uploadGuideFile = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_GUIDE_TYPES.includes(file.mimetype)) {
            return cb(new Error('Lubatud on ainult PDF, Word (.doc/.docx) või pildifailid.'));
        }
        cb(null, true);
    },
});

module.exports = { upload, uploadGuideFile };
