-- Vaste plek achteraf betalen (besluit bestuur, okt 2026): na afloop van elke periode van
-- 4 weken krijgt de band een rekening voor de keren dat ze kwamen. Zie
-- docs/PLAN-achteraf-betalen.md.

-- De factuurregel per periode. Leeg bij de oude, vooruitbetaalde periodes.
ALTER TABLE subscription_payments
  ADD COLUMN IF NOT EXISTS sessions_held INTEGER,
  ADD COLUMN IF NOT EXISTS sessions_cancelled INTEGER,
  ADD COLUMN IF NOT EXISTS session_price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS storage_cents INTEGER;

-- Opgezegde vaste plek: tot en met deze dag wordt nog afgerekend (de laatste rekening).
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS bill_until DATE;
