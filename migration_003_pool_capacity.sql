-- Lisab pools tabelisse max_players välja - admin määrab, mitu mängijat
-- ühte pooli mahub, ja mängijad saavad ise pooli valida selle piires.
-- Käivita Railway Postgres "Data" SQL-aknas.

ALTER TABLE pools ADD COLUMN IF NOT EXISTS max_players INTEGER;

COMMENT ON COLUMN pools.max_players IS
    'Maksimaalne mängijate arv selles poolis. NULL = piiramatu.';
