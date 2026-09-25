-- Wie er betaald heeft (naam uit Mollie: rekeninghouder bij iDEAL, naam op de kaart),
-- zodat bandleden in "Mijn boekingen" kunnen zien of en door wie er betaald is.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_by TEXT;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS paid_by TEXT;
