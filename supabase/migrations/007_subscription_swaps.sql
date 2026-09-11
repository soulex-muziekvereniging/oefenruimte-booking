-- Zelf kunnen "schuiven" van één repetitie binnen de lopende periode (besluit bestuur
-- 2026-09-11, punt 3/5): max. 2x per periode, tot 48u van tevoren, naar een ander vrij
-- dagdeel. Een schuif verandert niet het structurele weekdag+dagdeel-patroon van de band
-- (dat blijft in `subscriptions` staan) - het registreert alleen dat één specifieke datum
-- is overgeslagen en/of vervangen door een andere datum/dagdeel.

CREATE TABLE subscription_swaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  period_month DATE NOT NULL,
  original_date DATE NOT NULL,
  new_date DATE,
  new_dagdeel_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (subscription_id, original_date)
);

CREATE INDEX idx_subscription_swaps_subscription ON subscription_swaps (subscription_id);
CREATE INDEX idx_subscription_swaps_new_date ON subscription_swaps (new_date, new_dagdeel_id);
