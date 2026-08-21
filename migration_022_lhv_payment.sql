-- Käivita Railway Postgres "Data" SQL-aknas.
-- LHV LinkPay (EveryPay/Notifications API) integratsiooni jaoks vajalikud
-- väljad: notification token (mille abil hiljem staatust küsime) ja
-- makselehe URL, mida mängijale kuvame.

ALTER TABLE registrations ADD COLUMN IF NOT EXISTS lhv_notification_token TEXT;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS lhv_payment_link_url TEXT;
