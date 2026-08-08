const { Pool } = require('pg');

// Railway annab DATABASE_URL keskkonnamuutuja automaatselt, kui projektile
// on lisatud Postgres plugin. SSL on Railway's vajalik, kohalikus arenduses mitte.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
    console.error('Ootamatu viga andmebaasi connection pool\'is:', err);
});

module.exports = pool;
