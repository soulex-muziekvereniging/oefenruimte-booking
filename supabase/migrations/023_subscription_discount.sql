-- Korting op een vaste reservering (bijv. Grensland: korte repetitie van 1,5 uur, halve
-- prijs). Het beheer zet hem per vaste plek aan of uit. De korting geldt alleen voor de
-- repetities, niet voor de opslagruimte. price_cents blijft het bedrag dat de band
-- echt betaalt (dus ná korting), zodat rekeningen en overzichten niets anders hoeven.
--
-- discount_percent: 0 = geen korting; discount_note: waarom (zichtbaar voor het beheer).

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS discount_percent INTEGER NOT NULL DEFAULT 0
    CHECK (discount_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS discount_note TEXT;
