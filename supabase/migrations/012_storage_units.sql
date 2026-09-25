-- Opslagruimte bijhuren bij een vaste reservering (ruimtes 2, 3 en 4; 1 en 5 zijn van
-- Soulex zelf). De prijs zit in subscriptions.price_cents, zodat hij gewoon op dezelfde
-- rekening per 4 weken komt. Welke ruimtes er zijn staat in src/config.ts.
ALTER TABLE subscriptions ADD COLUMN storage_unit TEXT;
