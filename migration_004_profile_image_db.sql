-- Lisab players tabelisse veerud profiilipildi otse andmebaasi salvestamiseks.
-- See asendab varasema failisüsteemi-põhise lahenduse (mis sõltus Railway
-- Volume'ist), et vältida pildikadu konteineri taaskäivitustel.
-- Käivita Railway Postgres "Data" SQL-aknas.

ALTER TABLE players ADD COLUMN IF NOT EXISTS profile_image_data BYTEA;
ALTER TABLE players ADD COLUMN IF NOT EXISTS profile_image_mimetype VARCHAR(50);
