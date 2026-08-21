// ---------------------------------------------------------------------------
// LHV LinkPay (EveryPay Notifications API) klient.
//
// LHV Paytech kasutab endise EveryPay REST/JSON API't, ainult teiste
// domeeninimedega:
//   Test (sandbox):  https://payment.sandbox.lhv.ee/api/
//   Toodang:         https://payment.lhv.ee/api/
//
// Autentimine käib HTTP Basic Auth'iga: salajane võti kasutajanimeks,
// parool tühjaks jäetakse.
//
// Vajalikud Railway keskkonnamuutujad:
//   LHV_SECRET_KEY   - kaupmeheportaalist saadud salajane API võti
//   LHV_API_BASE_URL - https://payment.sandbox.lhv.ee/api (testimisel)
//                      või https://payment.lhv.ee/api (live'is)
//
// Kui LHV_SECRET_KEY puudub, käitume graatsiliselt (funktsioonid viskavad
// selge vea), et server ei kukuks kokku, kui integratsioon pole veel
// seadistatud.
// ---------------------------------------------------------------------------

function getConfig() {
    const secretKey = process.env.LHV_SECRET_KEY;
    const baseUrl = process.env.LHV_API_BASE_URL || 'https://payment.sandbox.lhv.ee/api';
    if (!secretKey) {
        throw new Error('LHV_SECRET_KEY puudub Railway keskkonnamuutujates - LHV makse pole seadistatud.');
    }
    return { secretKey, baseUrl };
}

function authHeader(secretKey) {
    return 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64');
}

// ---------------------------------------------------------------------------
// Loob uue makseteatise (notification) - see genereerib LHV-poolse
// makselehe lingi, mida saame mängijale kuvada/saata. skip_notify=1,
// et LHV ise emaili ei saada - kontrollime ise kogu voogu oma süsteemis.
// ---------------------------------------------------------------------------
async function createNotification({ amountEur, description, payeeEmail, payeeName, metadata }) {
    const { secretKey, baseUrl } = getConfig();

    const body = new URLSearchParams();
    body.set('amount', String(Math.round(amountEur * 100))); // LHV/EveryPay ootab sente
    body.set('description', description);
    body.set('skip_notify', '1');
    if (payeeEmail) body.set('payee_email', payeeEmail);
    if (payeeName) body.set('payee_name', payeeName);
    if (metadata) {
        for (const [key, value] of Object.entries(metadata)) {
            body.set(`metadata[${key}]`, String(value));
        }
    }

    const res = await fetch(`${baseUrl}/notifications`, {
        method: 'POST',
        headers: {
            Authorization: authHeader(secretKey),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data?.error?.message || 'LHV makseteatise loomine ebaõnnestus.');
    }
    return data; // sisaldab token, status, payment_link_url
}

// ---------------------------------------------------------------------------
// Küsib makseteatise hetkeseisu otse LHV-lt (mitte ei usalda pimesi
// callback'i sisu - see on turvalisem, kuna keegi ei saa võltsitud
// callback'iga makset "kinnitada").
// ---------------------------------------------------------------------------
async function getNotification(token) {
    const { secretKey, baseUrl } = getConfig();

    const res = await fetch(`${baseUrl}/notifications/${token}`, {
        headers: { Authorization: authHeader(secretKey) },
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data?.error?.message || 'LHV makseteatise päring ebaõnnestus.');
    }
    return data;
}

module.exports = { createNotification, getNotification };
