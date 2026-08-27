// ---------------------------------------------------------------------------
// Bag Tag süsteem - tuumloogika.
//
// Reeglid (kokku lepitud):
// 1. Number tekib konto loomisel: current-max+1, eraldi jadad meestele (M)
//    ja naistele (N).
// 2. Pärast võistluse lõppu, iga divisjoni (soo) kohta eraldi: mängijad,
//    kes lõpetasid, järjestatakse tulemuse (relativeToPar) järgi; nende
//    HETKEL käes olevad numbrid võetakse, sorteeritakse kasvavalt, ja
//    jagatakse uuesti tulemuse järjekorras (parim tulemus = madalaim
//    number sellest hulgast).
// 3. Kui mängija on 2 kuud mitte ühelgi võistlusel mänginud (ajapõhine,
//    mitte ühe konkreetse võistluse põhine), käivitub ahelreaktsioon:
//    kõik, kelle number on kõrgem, nihkuvad ühe võrra allapoole; tema
//    ise saab uue suurima numbri oma soo jadas.
// 4. Kui admin kustutab mängija, sulgub auk samamoodi (kõik kõrgemad
//    numbrid nihkuvad ühe võrra allapoole).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Uue mängija number konto loomisel.
// ---------------------------------------------------------------------------
async function assignNewPlayerNumber(client, playerId, gender) {
    const { rows } = await client.query(
        'SELECT COALESCE(MAX(bag_tag_number), 0) + 1 AS next_number FROM players WHERE gender = $1',
        [gender]
    );
    const nextNumber = rows[0].next_number;
    await client.query(
        `UPDATE players SET bag_tag_number = $1, bag_tag_previous_number = $1, bag_tag_last_played_at = now()
         WHERE id = $2`,
        [nextNumber, playerId]
    );
    return nextNumber;
}

// ---------------------------------------------------------------------------
// Ühe mängija "ahelreaktsiooniga" tõukamine rivi lõppu (kasutatakse nii
// mitteaktiivsuse kui - tulevikus - muude sarnaste juhtumite jaoks).
// Kõik, kelle number on kõrgem, nihkuvad ühe võrra allapoole; see mängija
// ise saab uue (muutumatu) suurima numbri oma soo jadas.
// ---------------------------------------------------------------------------
async function demoteToBack(client, playerId) {
    const { rows } = await client.query('SELECT gender, bag_tag_number FROM players WHERE id = $1', [playerId]);
    const player = rows[0];
    if (!player || player.bag_tag_number === null) return;

    const { rows: maxRows } = await client.query(
        'SELECT MAX(bag_tag_number) AS max_number FROM players WHERE gender = $1',
        [player.gender]
    );
    const maxNumber = maxRows[0].max_number;
    if (player.bag_tag_number >= maxNumber) return; // juba rivi lõpus, pole vaja midagi teha

    await client.query(
        'UPDATE players SET bag_tag_number = bag_tag_number - 1 WHERE gender = $1 AND bag_tag_number > $2',
        [player.gender, player.bag_tag_number]
    );
    await client.query(
        'UPDATE players SET bag_tag_previous_number = $1, bag_tag_number = $2 WHERE id = $3',
        [player.bag_tag_number, maxNumber, playerId]
    );
}

// ---------------------------------------------------------------------------
// Kutsutakse ENNE mängija kustutamist (samas transaktsioonis) - sulgeb
// augu, mis tema numbri kustutamisel tekiks.
// ---------------------------------------------------------------------------
async function closeGapBeforeRemoval(client, playerId) {
    const { rows } = await client.query('SELECT gender, bag_tag_number FROM players WHERE id = $1', [playerId]);
    const player = rows[0];
    if (!player || player.bag_tag_number === null) return;

    await client.query(
        'UPDATE players SET bag_tag_number = bag_tag_number - 1 WHERE gender = $1 AND bag_tag_number > $2',
        [player.gender, player.bag_tag_number]
    );
}

// ---------------------------------------------------------------------------
// 2 kuu mitteaktiivsuse kontroll - "laisk" kontroll, käivitatakse iga kord,
// kui edetabelit küsitakse. Idempotentne: kui mängija on juba rivi lõpus,
// jäetakse ta vahele, et sama asja korduvalt ümber ei arvutataks.
// ---------------------------------------------------------------------------
async function processOverdueInactivePlayers(client) {
    const { rows: overdue } = await client.query(
        `SELECT id, gender, bag_tag_number
         FROM players
         WHERE bag_tag_number IS NOT NULL
           AND bag_tag_last_played_at < now() - interval '2 months'
         ORDER BY bag_tag_last_played_at ASC, created_at ASC`
    );

    for (const player of overdue) {
        await demoteToBack(client, player.id);
    }
}

// ---------------------------------------------------------------------------
// Pärast võistluse (ühe divisjoni) lõppu - jagab numbrid uuesti tulemuse
// järjekorras, ainult nende vahel, kes selle divisjoni sees selle
// võistluse päriselt lõpetasid.
// ---------------------------------------------------------------------------
async function recomputeEventDivision(client, eventId, divisionId) {
    const { rows: divisionRows } = await client.query('SELECT gender FROM divisions WHERE id = $1', [divisionId]);
    if (!divisionRows[0] || !divisionRows[0].gender) return { updated: 0 };

    const { rows: results } = await client.query(
        `SELECT reg.player_id, p.bag_tag_number,
                COALESCE(SUM(os.strokes), 0) - COALESCE(SUM(h.par) FILTER (WHERE os.strokes IS NOT NULL), 0) AS relative_to_par
         FROM registrations reg
         JOIN players p ON p.id = reg.player_id
         JOIN rounds r ON r.event_id = reg.event_id
         LEFT JOIN holes h ON h.round_id = r.id
         LEFT JOIN official_scores os ON os.player_id = reg.player_id AND os.hole_id = h.id AND os.round_id = r.id
         WHERE reg.event_id = $1 AND reg.division_id = $2 AND reg.completed_at IS NOT NULL
           AND p.bag_tag_number IS NOT NULL
         GROUP BY reg.player_id, p.bag_tag_number
         ORDER BY relative_to_par ASC, p.bag_tag_number ASC`,
        [eventId, divisionId]
    );

    if (results.length === 0) return { updated: 0 };

    const availableSlots = results.map((r) => r.bag_tag_number).sort((a, b) => a - b);

    for (let i = 0; i < results.length; i++) {
        const player = results[i];
        const newNumber = availableSlots[i];
        await client.query(
            `UPDATE players SET bag_tag_previous_number = $1, bag_tag_number = $2, bag_tag_last_played_at = now()
             WHERE id = $3`,
            [player.bag_tag_number, newNumber, player.player_id]
        );
    }

    return { updated: results.length };
}

module.exports = {
    assignNewPlayerNumber,
    demoteToBack,
    closeGapBeforeRemoval,
    processOverdueInactivePlayers,
    recomputeEventDivision,
};
