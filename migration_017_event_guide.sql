-- Käivita Railway Postgres "Data" SQL-aknas.
-- Lisab event'ile juhendi - kas vaba tekstina või dokumendina (PDF/DOC/pilt),
-- mida admin saab iga võistluse jaoks eraldi täita. Mängija näeb "Juhend"
-- nuppu oma dashboardil. Dokument salvestatakse otse andmebaasi (bytea),
-- samamoodi nagu mängija profiilipilt - pole vaja eraldi failihoidlat.

ALTER TABLE events ADD COLUMN IF NOT EXISTS guide_text TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS guide_file_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS guide_file_name TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS guide_file_data BYTEA;
ALTER TABLE events ADD COLUMN IF NOT EXISTS guide_file_mimetype TEXT;
