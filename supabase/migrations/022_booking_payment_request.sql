-- Losse boeking die het beheer met de hand inplant, met de keuze of de band nog moet
-- betalen. Zo ja: de boeking staat meteen vast en de band krijgt een betaallink per mail
-- (zelfde manier als bij de rekeningen van een vaste plek: de Mollie-betaling wordt pas
-- gemaakt als de band op de link klikt, zodat de link niet verloopt).
--
-- payment_status: leeg = gewone boeking (online betaald bij het boeken, of beheer zonder
-- betaling); 'open' = betaalverzoek verstuurd, nog niet betaald; 'paid' = betaald (via de
-- link of handmatig geregistreerd); 'waived' = kwijtgescholden.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_status TEXT,
  ADD COLUMN IF NOT EXISTS pay_token UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS pending_payment_id TEXT, -- lopende Mollie-betaling via de link
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_pay_token ON bookings (pay_token);
