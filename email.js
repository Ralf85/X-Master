// ---------------------------------------------------------------------------
// Email saatmine (Resend.com kaudu).
//
// SEADISTAMINE (vajalik enne live'i, muidu PIN-i taastamise email ei lähe):
//   1. Loo tasuta konto: https://resend.com (tasuta plaan lubab 100 emaili/päev,
//      3000/kuu - piisab suurelt jaolt ka sadade mängijate jaoks).
//   2. Lisa oma domeen Resend'is (Settings -> Domains) VÕI kasuta testimiseks
//      nende valmis "onboarding@resend.dev" saatja aadressi (see töötab kohe,
//      aga on mõeldud ainult testimiseks - live'is soovita oma domeen kinnitada).
//   3. Kopeeri API võti (Settings -> API Keys) ja lisa Railway'sse
//      Environment Variables alla: RESEND_API_KEY=re_xxxxxxxx
//   4. Kui oma domeen on kinnitatud, lisa ka: EMAIL_FROM=X-Master <teated@sinudomeen.ee>
//      Kui EMAIL_FROM puudub, kasutatakse vaikimisi "X-Master <onboarding@resend.dev>".
//
// Kui RESEND_API_KEY puudub, ei visata viga - kood logib konsooli (nagu varem)
// ja rakendus töötab edasi, lihtsalt email ei lähe kohale.
// ---------------------------------------------------------------------------

let resendClient = null;
function getResendClient() {
    if (!process.env.RESEND_API_KEY) return null;
    if (!resendClient) {
        const { Resend } = require('resend');
        resendClient = new Resend(process.env.RESEND_API_KEY);
    }
    return resendClient;
}

async function sendRecoveryEmail({ to, playerNumber, recoveryCode }) {
    const client = getResendClient();
    if (!client) {
        console.log(`[FORGOT PIN] (RESEND_API_KEY puudub, email ei saadetud) Player ${playerNumber} taastekood: ${recoveryCode}`);
        return { sent: false };
    }

    const from = process.env.EMAIL_FROM || 'X-Master <onboarding@resend.dev>';

    try {
        await client.emails.send({
            from,
            to,
            subject: 'X-Master - PIN-i taastekood',
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2 style="color: #16302c;">PIN-i taastamine</h2>
                    <p>Sinu Player ID: <strong>${playerNumber}</strong></p>
                    <p>Sinu taastekood:</p>
                    <div style="font-size: 28px; font-weight: 700; letter-spacing: 4px; background: #dceeec; color: #16302c; padding: 16px; border-radius: 8px; text-align: center;">
                        ${recoveryCode}
                    </div>
                    <p style="color: #6f8f8a; font-size: 13px; margin-top: 20px;">
                        Kui sa PIN-i taastamist ei küsinud, võid selle kirja lihtsalt ignoreerida.
                    </p>
                </div>
            `,
        });
        return { sent: true };
    } catch (err) {
        console.error('[FORGOT PIN] Emaili saatmine ebaõnnestus:', err.message);
        console.log(`[FORGOT PIN] (fallback) Player ${playerNumber} taastekood: ${recoveryCode}`);
        return { sent: false };
    }
}

async function sendPaymentReminderEmail({ to, playerName, eventName, paymentLink }) {
    const client = getResendClient();
    if (!client) {
        console.log(`[PAYMENT REMINDER] (RESEND_API_KEY puudub, email ei saadetud) ${to} - ${eventName}`);
        return { sent: false };
    }

    const from = process.env.EMAIL_FROM || 'X-Master <onboarding@resend.dev>';

    try {
        await client.emails.send({
            from,
            to,
            subject: `Meeldetuletus: makse ootel - ${eventName}`,
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2 style="color: #16302c;">Meeldetuletus makse kohta</h2>
                    <p>Tere${playerName ? ', ' + playerName : ''}!</p>
                    <p>Sinu registreerimine võistlusele <strong>${eventName}</strong> ootab veel osalustasu tasumist.</p>
                    ${paymentLink ? `<p><a href="${paymentLink}" style="display:inline-block; background:#ff6b35; color:#1a0e08; font-weight:700; padding:12px 20px; border-radius:8px; text-decoration:none; margin-top:10px;">Maksa siin</a></p>` : ''}
                    <p style="color: #6f8f8a; font-size: 13px; margin-top: 20px;">
                        Kui oled juba maksnud, võid selle kirja ignoreerida - korraldaja kinnitab makse peagi.
                    </p>
                </div>
            `,
        });
        return { sent: true };
    } catch (err) {
        console.error('[PAYMENT REMINDER] Emaili saatmine ebaõnnestus:', err.message);
        return { sent: false };
    }
}

module.exports = { sendRecoveryEmail, sendPaymentReminderEmail };
