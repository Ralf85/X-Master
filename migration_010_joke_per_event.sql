-- Käivita Railway Postgres "Data" SQL-aknas.
-- Seob anekdoodid konkreetse võistlusega, mitte ei jaga neid enam kõigi
-- võistluste vahel. Olemasolevad (event_id = NULL) anekdoodid jäävad
-- orvuks - need ei kuvata enam kuskil, kuna päring nõuab nüüd alati
-- konkreetset event_id-d. Kui soovid mõnda vana anekdooti taaskasutada,
-- lisa see lihtsalt uuesti soovitud võistluse alt.

ALTER TABLE joke_templates ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_joke_templates_event ON joke_templates (event_id);
