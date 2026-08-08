const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

function isValidPinFormat(pin) {
    // 4-6 numbrit, vastavalt Master Scriptile
    return typeof pin === 'string' && /^\d{4,6}$/.test(pin);
}

async function hashPin(pin) {
    return bcrypt.hash(pin, SALT_ROUNDS);
}

async function comparePin(pin, hash) {
    if (!hash) return false;
    return bcrypt.compare(pin, hash);
}

function generateRecoveryCode() {
    // 8-kohaline numbriline taastekood, mida saab kasutajale näidata/saata
    return Math.floor(10000000 + Math.random() * 90000000).toString();
}

module.exports = { isValidPinFormat, hashPin, comparePin, generateRecoveryCode };
