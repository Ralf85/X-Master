-- Käivita Railway Postgres "Data" SQL-aknas.
-- Anekdoodi-mallid, kuhu admin kirjutab nalja {P1}, {P2}, {P3}, {P4}... kohatäitjatega,
-- mis asendatakse automaatselt selle pooli päris mängijate eesnimedega.
CREATE TABLE IF NOT EXISTS joke_templates (
    id            SERIAL PRIMARY KEY,
    template_text TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
