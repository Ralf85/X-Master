-- Käivita Railway Postgres "Data" SQL-aknas.
-- Lisab event'ile makselingi (nt LHV maksekorra link), mida admin saab
-- võistluse Ülevaate tabis seadistada, ja mida mängija näeb oma
-- registreerumise juures (kuni admin on registreerumise kinnitanud).

ALTER TABLE events ADD COLUMN IF NOT EXISTS payment_link TEXT;
