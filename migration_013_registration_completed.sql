-- Käivita Railway Postgres "Data" SQL-aknas.
-- Lisab registreerimisele "completed_at" välja - kui mängija ise oma
-- ringi lõpuni märgib, saab dashboard selle "Toimunud võistlused" alla
-- tõsta, ilma et admin peaks kogu event'i eraldi "finished" staatusesse
-- panema.

ALTER TABLE registrations ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
