// Loob esimese admini kontode tabelisse .env failis olevate ADMIN_* väärtuste järgi.
// Käivita: npm run seed-admin
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/db');

async function main() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const fullName = process.env.ADMIN_NAME || 'Admin';

    if (!email || !password) {
        console.error('ADMIN_EMAIL ja ADMIN_PASSWORD peavad .env failis olema seatud.');
        process.exit(1);
    }

    const existing = await pool.query('SELECT id FROM admins WHERE email = $1', [email]);
    if (existing.rows[0]) {
        console.log(`Admin ${email} on juba olemas, ei loo uuesti.`);
        process.exit(0);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
        `INSERT INTO admins (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'super_admin')`,
        [email, passwordHash, fullName]
    );

    console.log(`Admin ${email} loodud.`);
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
