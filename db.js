const { Pool } = require('pg');

// Railway annab DATABASE_URL keskkonnamuutuja automaatselt, kui projektile
// on lisatud Postgres plugin. Railway sisemine (privaatvõrgu) andmebaasiühendus
// ei vaja SSL-i - seetõttu jätame selle siin lihtsalt väljalülitatuks.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
    console.error('Ootamatu viga andmebaasi connection pool\'is:', err);
});

module.exports = pool;
