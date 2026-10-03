-- Opmerking bij een betaalperiode die het beheer met de hand afhandelt (tab Betalingen):
-- hoe er buiten Mollie is betaald, of waarom een periode is kwijtgescholden, en door wie.
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS admin_note TEXT;
