-- Käivita Railway Postgres "Data" SQL-aknas.
-- Lisab mängijale sünniaja ja soo ning divisjonile soo-sildi, et registreerimisel
-- saaks divisjoni automaatselt siduda mängija soo järgi (mehed/naised).

ALTER TABLE players ADD COLUMN birth_date DATE;
ALTER TABLE players ADD COLUMN gender VARCHAR(1) CHECK (gender IS NULL OR gender IN ('M', 'N'));

ALTER TABLE divisions ADD COLUMN gender VARCHAR(1) CHECK (gender IS NULL OR gender IN ('M', 'N'));

-- Igale olemasolevale event'ile, millel veel pole ühtki divisjoni,
-- lisa kohe "Mehed" ja "Naised" divisjonid (uutele event'itele teeb seda edaspidi kood).
INSERT INTO divisions (event_id, name, gender, sort_order)
SELECT e.id, d.name, d.gender, d.sort_order
FROM events e
CROSS JOIN (VALUES ('Mehed', 'M', 0), ('Naised', 'N', 1)) AS d(name, gender, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM divisions dd WHERE dd.event_id = e.id);

-- Kui event'il on juba täpselt "Mehed" ja/või "Naised" nimega divisjon, aga
-- soo-silt on veel tühi, täida see automaatselt (ei loo duplikaate).
UPDATE divisions SET gender = 'M' WHERE name = 'Mehed' AND gender IS NULL;
UPDATE divisions SET gender = 'N' WHERE name = 'Naised' AND gender IS NULL;
