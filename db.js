const { Pool } = require('pg');

// Railway annab DATABASE_URL keskkonnamuutuja automaatselt, kui projektile
// on lisatud Postgres plugin. Railway sisemine (privaatvõrgu) andmebaasiühendus
// ei vaja SSL-i - seetõttu jätame selle siin lihtsalt väljalülitatuks.
//
// max: 20 - vaikimisi oleks 10, aga suuremate võistluste puhul (250-500+
// mängijat, kes korraga tulemusi sisestavad) annab suurem "pool" rohkem
// puhvrit tipphetkedel, ilma et päringud liiga kaua järjekorras ootaks.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
});

pool.on('error', (err) => {
    console.error('Ootamatu viga andmebaasi connection pool\'is:', err);
});

module.exports = pool;
