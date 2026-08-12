-- Käivita Railway Postgres "Data" SQL-aknas.
-- Lisab registreerimisele eraldi "makstud" välja, mis on sõltumatu
-- staatuse (registered/confirmed) väljast. Mängija näeb "Kinnitatud"
-- oma dashboardil ainult siis, kui see väli on täidetud.

ALTER TABLE registrations ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
