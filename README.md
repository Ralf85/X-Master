# Disc Golf Scoring System — Backend

Discgolfi võistluste platvormi API. Node.js/Express/PostgreSQL, mõeldud Railway peale
deploy'imiseks (sama viis mis Royal Paigaldus rakendusel).

## Mis on praegu tehtud (v1)

- Andmebaasi skeem (`schema.sql`) — kõik tabelid mängijatest kuni score-konfliktideni
- Mängija konto: registreerimine, PIN-login, unustatud-PIN taaste, profiili muutmine
- Admin: email/parool login
- Turvaline PIN-hašimine (bcryptjs), JWT sessioonid

## Mis tuleb järgmisena

- Events/divisions/parks/holes CRUD (admin)
- Registreerimisvoog võistlustele
- Scorecard + score-entry API (matching/conflict loogika)
- Live leaderboard endpoint
- Frontend

## Kohalik käivitamine

```bash
npm install
cp .env.example .env
# täida .env oma andmetega
# loo andmebaas ja käivita schema.sql
psql $DATABASE_URL -f schema.sql
npm run seed-admin
npm run dev
```

## Railway deploy

Vaata jututoas olevat samm-sammulist juhendit. Lühidalt:

1. Lae see kaust GitHubi (Upload files, mitte veebiredaktor)
2. Railway: New Project → Deploy from GitHub repo
3. Lisa projektile PostgreSQL plugin (Railway seab `DATABASE_URL` automaatselt)
4. Lisa muud keskkonnamuutujad Railway "Variables" alt (vt `.env.example`)
5. Käivita `schema.sql` Railway andmebaasi vastu
6. Käivita `npm run seed-admin` (Railway'i väline connection string abil, kohapeal)
