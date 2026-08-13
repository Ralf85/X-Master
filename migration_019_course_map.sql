-- Käivita Railway Postgres "Data" SQL-aknas.
-- Lisab event'ile rajakaardi (pilt), mida admin saab üles laadida ja
-- mille nähtavust (AVALIK/PEIDUS) saab eraldi kontrollida - kui PEIDUS,
-- ei näe mängija seda moodulit üldse.

ALTER TABLE events ADD COLUMN IF NOT EXISTS course_map_visible BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS course_map_data BYTEA;
ALTER TABLE events ADD COLUMN IF NOT EXISTS course_map_mimetype TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS course_map_name TEXT;
