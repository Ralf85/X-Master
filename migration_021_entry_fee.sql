-- Käivita Railway Postgres "Data" SQL-aknas.
-- Lisab event'ile struktureeritud osalustasu summa (eurodes), mida
-- automaatne makselahendus (LHV LinkPay vms) hiljem vajab, et teada,
-- kui palju konkreetselt küsida. Praegune payment_link jääb alles
-- käsitsi-voo jaoks.

ALTER TABLE events ADD COLUMN IF NOT EXISTS entry_fee NUMERIC(10,2);
