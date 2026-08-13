-- Käivita Railway Postgres "Data" SQL-aknas.
-- Lisab kontole endale (mitte ainult IP-le) läbiproovimise kaitse -
-- kui keegi eksib PIN-iga liiga mitu korda järjest (nt teiste IP-de
-- kaudu), lukustub SEE KONKREETNE KONTO ajutiselt, sõltumata sellest,
-- mitmelt erinevalt IP-lt üritatakse.

ALTER TABLE players ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
