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

module.exports = { sendRecoveryEmail };
