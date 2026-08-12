-- Käivita Railway Postgres "Data" SQL-aknas.
-- Lisab võimaluse siduda anekdoot konkreetse raja numbriga (valikuline).
-- NULL = läheb üldisesse juhuslikku valikusse (nagu praegu).

ALTER TABLE joke_templates ADD COLUMN IF NOT EXISTS hole_number INTEGER;
