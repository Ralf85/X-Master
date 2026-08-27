-- Käivita Railway Postgres "Data" SQL-aknas.
-- Digitaalne "bag tag" süsteem: iga mängija saab konto loomisel numbri
-- (eraldi jadad meestele ja naistele), mis vahetub võistlustulemuste
-- põhjal ja langeb 2 kuu mitteaktiivsuse korral rivi lõppu.

ALTER TABLE players ADD COLUMN IF NOT EXISTS bag_tag_number INTEGER;
ALTER TABLE players ADD COLUMN IF NOT EXISTS bag_tag_previous_number INTEGER;
ALTER TABLE players ADD COLUMN IF NOT EXISTS bag_tag_last_played_at TIMESTAMPTZ;

-- Tagasitäitmine: olemasolevad mängijad saavad numbri registreerumis-
-- järjekorra (created_at) põhjal, eraldi mehed ja naised. Mängijad, kellel
-- gender pole määratud, jäävad numbrita (ei saa bag tag'i enne kui sugu on teada).
WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY gender ORDER BY created_at) AS rn
    FROM players
    WHERE gender IN ('M', 'N') AND bag_tag_number IS NULL
)
UPDATE players p
SET bag_tag_number = ranked.rn,
    bag_tag_previous_number = ranked.rn,
    bag_tag_last_played_at = p.created_at
FROM ranked
WHERE p.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_bag_tag_unique
    ON players (gender, bag_tag_number) WHERE bag_tag_number IS NOT NULL;
