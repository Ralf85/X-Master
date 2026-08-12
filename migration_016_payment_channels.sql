-- Käivita Railway Postgres "Data" SQL-aknas.
-- Lisab kaks eraldi makseallikat (Pank / Stebby), et saaks trackida,
-- kummast kanalist makse tuli. Vana "paid_at" veerg jääb kasutamata
-- alles (ei sega midagi).

ALTER TABLE registrations ADD COLUMN IF NOT EXISTS bank_paid_at TIMESTAMPTZ;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS stebby_paid_at TIMESTAMPTZ;
