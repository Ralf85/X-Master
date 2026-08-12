-- Käivita Railway Postgres "Data" SQL-aknas.
-- Lubab tulemuse jätta märkimata ("-" / rada jäi vahele), et ring saaks siiski lõpetada.

ALTER TABLE score_entries ALTER COLUMN strokes DROP NOT NULL;
ALTER TABLE score_entries DROP CONSTRAINT score_entries_strokes_check;
ALTER TABLE score_entries ADD CONSTRAINT score_entries_strokes_check CHECK (strokes IS NULL OR strokes >= 1);

ALTER TABLE official_scores ALTER COLUMN strokes DROP NOT NULL;
ALTER TABLE official_scores DROP CONSTRAINT official_scores_strokes_check;
ALTER TABLE official_scores ADD CONSTRAINT official_scores_strokes_check CHECK (strokes IS NULL OR strokes >= 1);

ALTER TABLE official_scores DROP CONSTRAINT official_scores_status_check;
ALTER TABLE official_scores ADD CONSTRAINT official_scores_status_check
    CHECK (status IN ('normal', 'conflict', 'dnp'));

ALTER TABLE score_conflicts ALTER COLUMN existing_value DROP NOT NULL;
ALTER TABLE score_conflicts ALTER COLUMN attempted_value DROP NOT NULL;
