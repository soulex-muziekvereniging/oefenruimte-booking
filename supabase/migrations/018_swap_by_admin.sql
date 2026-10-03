-- Verplaatsingen/vrijgaven die het beheer namens een band doet tellen niet mee voor de
-- limiet van de band (config.subscriptionMaxSwapsPerPeriod).
ALTER TABLE subscription_swaps ADD COLUMN IF NOT EXISTS by_admin BOOLEAN NOT NULL DEFAULT false;
