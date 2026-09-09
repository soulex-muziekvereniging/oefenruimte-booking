CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=zondag .. 6=zaterdag
  dagdeel_id TEXT NOT NULL, -- 'ochtend' | 'middag' | 'avond', zie src/config.ts
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly')),
  price_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_first_payment', -- pending_first_payment | active | cancelled
  mollie_customer_id TEXT,
  mollie_mandate_id TEXT,
  mollie_subscription_id TEXT,
  mollie_first_payment_id TEXT UNIQUE,
  cancel_token UUID DEFAULT gen_random_uuid(),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Eén weekdag+dagdeel kan maar door één actieve vaste reservering geclaimd worden.
CREATE UNIQUE INDEX unique_active_subscription_slot
  ON subscriptions (weekday, dagdeel_id)
  WHERE status IN ('pending_first_payment', 'active');

CREATE INDEX idx_subscriptions_status ON subscriptions (status);
