-- Vaste reservering stapt over van automatische Mollie-incasso (mandaat +
-- customerSubscriptions) naar maandelijks vooraf betalen zonder incasso: elke
-- kalendermaand krijgt een eigen betaalverzoek, en het recht op het tijdslot
-- vervalt pas als er niet binnen de coulanceperiode betaald wordt. Zie
-- BESTUUR.md en de projectmemory "soulex-payment-model-pivot" voor de
-- besluiten van het bestuur (2026-09-11) achter dit model.

ALTER TABLE subscriptions
  DROP COLUMN mollie_mandate_id,
  DROP COLUMN mollie_subscription_id,
  ADD COLUMN term_start_date DATE,
  ADD COLUMN term_end_date DATE;

-- "lapsed" (vervallen door niet-betalen) is nieuw naast pending_first_payment/active/cancelled.
-- Bewust geen CHECK-constraint op status, net als voorheen - consistent met de rest van de tabel.

CREATE TABLE subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  period_month DATE NOT NULL, -- altijd de 1e van de kalendermaand
  amount_cents INTEGER NOT NULL,
  due_date DATE NOT NULL,
  grace_until DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid', -- unpaid | paid | waived
  mollie_payment_id TEXT UNIQUE,
  pay_token UUID NOT NULL DEFAULT gen_random_uuid(),
  paid_at TIMESTAMPTZ,
  invoice_sent_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  warning_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (subscription_id, period_month)
);

CREATE INDEX idx_subscription_payments_status ON subscription_payments (status);
CREATE INDEX idx_subscription_payments_subscription ON subscription_payments (subscription_id);
