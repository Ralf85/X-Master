-- Käivita Railway Postgres "Data" SQL-aknas.
CREATE TABLE IF NOT EXISTS announcements (
    id                  SERIAL PRIMARY KEY,
    event_id            INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    message             TEXT NOT NULL,
    created_by_admin_id INTEGER REFERENCES admins(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
