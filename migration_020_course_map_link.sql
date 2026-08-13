-- Käivita Railway Postgres "Data" SQL-aknas.
-- Lisab rajakaardile ka lingi-võimaluse (nt Google Maps, UDisc rada, PDF
-- kuskil mujal), et admin ei peaks alati pilti üles laadima - piisab ka
-- ainult lingist, või mõlemast korraga.

ALTER TABLE events ADD COLUMN IF NOT EXISTS course_map_link TEXT;
