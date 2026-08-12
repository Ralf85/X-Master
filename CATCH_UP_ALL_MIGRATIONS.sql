-- ============================================================================
-- KOONDATUD "CATCH-UP" MIGRATSIOON
-- Käivita see Railway Postgres "Data" (SQL) aknas ÜKS KORD, live'i eel.
--
-- See fail on TURVALINE käivitada sõltumata sellest, millised varasematest
-- migration_003...migration_012 failidest on juba käivitatud - iga samm
-- kontrollib ise, kas midagi on juba tehtud, ja jätab vajadusel vahele.
-- Ei tee mitte midagi, kui kõik on juba korras.
-- ============================================================================

ALTER TABLE pools ADD COLUMN IF NOT EXISTS max_players INTEGER;

ALTER TABLE players ADD COLUMN IF NOT EXISTS profile_image_data BYTEA;
ALTER TABLE players ADD COLUMN IF NOT EXISTS profile_image_mimetype VARCHAR(50);

CREATE TABLE IF NOT EXISTS announcements (
    id                  SERIAL PRIMARY KEY,
    event_id            INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    message             TEXT NOT NULL,
    created_by_admin_id INTEGER REFERENCES admins(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS joke_templates (
    id            SERIAL PRIMARY KEY,
    template_text TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'score_entries' AND column_name = 'strokes' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE score_entries ALTER COLUMN strokes DROP NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'score_entries_strokes_check') THEN
        ALTER TABLE score_entries DROP CONSTRAINT score_entries_strokes_check;
    END IF;
    ALTER TABLE score_entries ADD CONSTRAINT score_entries_strokes_check CHECK (strokes IS NULL OR strokes >= 1);

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'official_scores' AND column_name = 'strokes' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE official_scores ALTER COLUMN strokes DROP NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'official_scores_strokes_check') THEN
        ALTER TABLE official_scores DROP CONSTRAINT official_scores_strokes_check;
    END IF;
    ALTER TABLE official_scores ADD CONSTRAINT official_scores_strokes_check CHECK (strokes IS NULL OR strokes >= 1);

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'official_scores_status_check') THEN
        ALTER TABLE official_scores DROP CONSTRAINT official_scores_status_check;
    END IF;
    ALTER TABLE official_scores ADD CONSTRAINT official_scores_status_check
        CHECK (status IN ('normal', 'conflict', 'dnp'));

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'score_conflicts' AND column_name = 'existing_value' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE score_conflicts ALTER COLUMN existing_value DROP NOT NULL;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'score_conflicts' AND column_name = 'attempted_value' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE score_conflicts ALTER COLUMN attempted_value DROP NOT NULL;
    END IF;
END $$;

ALTER TABLE joke_templates ADD COLUMN IF NOT EXISTS hole_number INTEGER;
ALTER TABLE joke_templates ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

ALTER TABLE joke_templates ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_joke_templates_event ON joke_templates (event_id);

ALTER TABLE pools ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'players' AND column_name = 'birth_date'
    ) THEN
        ALTER TABLE players ADD COLUMN birth_date DATE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'players' AND column_name = 'gender'
    ) THEN
        ALTER TABLE players ADD COLUMN gender VARCHAR(1) CHECK (gender IS NULL OR gender IN ('M', 'N'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'divisions' AND column_name = 'gender'
    ) THEN
        ALTER TABLE divisions ADD COLUMN gender VARCHAR(1) CHECK (gender IS NULL OR gender IN ('M', 'N'));
    END IF;
END $$;

INSERT INTO divisions (event_id, name, gender, sort_order)
SELECT e.id, d.name, d.gender, d.sort_order
FROM events e
CROSS JOIN (VALUES ('Mehed', 'M', 0), ('Naised', 'N', 1)) AS d(name, gender, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM divisions dd WHERE dd.event_id = e.id);

UPDATE divisions SET gender = 'M' WHERE name = 'Mehed' AND gender IS NULL;
UPDATE divisions SET gender = 'N' WHERE name = 'Naised' AND gender IS NULL;

-- ============================================================================
-- VALMIS. Kontroll: peaks tagastama 3, 1, 2, 1, 1
-- ============================================================================
SELECT
    (SELECT count(*) FROM information_schema.columns WHERE table_name = 'players' AND column_name IN ('gender','birth_date','profile_image_data')) AS players_cols_ok,
    (SELECT count(*) FROM information_schema.columns WHERE table_name = 'divisions' AND column_name = 'gender') AS divisions_gender_ok,
    (SELECT count(*) FROM information_schema.columns WHERE table_name = 'pools' AND column_name IN ('max_players','locked')) AS pools_cols_ok,
    (SELECT count(*) FROM information_schema.tables WHERE table_name = 'announcements') AS announcements_table_ok,
    (SELECT count(*) FROM information_schema.tables WHERE table_name = 'joke_templates') AS jokes_table_ok;
