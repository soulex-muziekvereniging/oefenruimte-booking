-- Vaste plek weer vooraf betalen, met verrekening (besluit bestuur, 21 okt 2026): de rekening
-- voor een periode van 4 weken gaat een week voor de periode uit. Een repetitie die de band
-- annuleert (tot 72 uur van tevoren) nadat die periode al gefactureerd is, wordt gekort op
-- de volgende rekening. Zie docs/PLAN-vooraf-met-verrekening.md.

-- Tegoed dat op deze rekening verrekend is (aantal keren en bedrag).
ALTER TABLE subscription_payments
  ADD COLUMN IF NOT EXISTS credit_sessions INTEGER,
  ADD COLUMN IF NOT EXISTS credit_cents INTEGER;

-- Op welke rekening deze geannuleerde keer verrekend is (leeg = nog niet, of niet nodig
-- omdat de keer al vóór de rekening geannuleerd was).
ALTER TABLE subscription_swaps
  ADD COLUMN IF NOT EXISTS credited_in UUID REFERENCES subscription_payments(id) ON DELETE SET NULL;
