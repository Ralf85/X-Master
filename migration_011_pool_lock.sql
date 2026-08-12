-- Käivita Railway Postgres "Data" SQL-aknas.
-- Lisab poolidele lukustuse: kui lukus, ei saa mängijad ise sinna liituda
-- (admin saab endiselt lisada läbi drag-and-drop / mängija lisamise).

ALTER TABLE pools ADD COLUMN locked BOOLEAN NOT NULL DEFAULT FALSE;
