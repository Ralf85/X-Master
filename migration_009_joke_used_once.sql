-- Käivita Railway Postgres "Data" SQL-aknas.
-- Jälgib, kas üldine (raja numbrita) anekdoot on juba näidatud, et see ei korduks.
-- Raja-spetsiifilised anekdoodid (hole_number määratud) EI kasuta seda - need
-- jäävad alati oma raja juurde püsima, mitu korda tahes.

ALTER TABLE joke_templates ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;
