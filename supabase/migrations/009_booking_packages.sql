-- Pakket "4x om de week": vervangt de doorlopende tweewekelijkse vaste reservering.
-- Een pakket is één Mollie-betaling voor een vast aantal losse boekingen (in `bookings`,
-- gekoppeld via package_id), zodat rooster, annuleren en "Mijn boekingen" gewoon werken.
-- Verlengen gaat via renew_token (link in de herinneringsmail).

CREATE TABLE booking_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  dagdeel_id TEXT NOT NULL,
  first_date DATE NOT NULL,
  last_date DATE NOT NULL,
  price_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | expired
  mollie_payment_id TEXT,
  renew_token UUID NOT NULL DEFAULT gen_random_uuid(),
  renewal_of UUID REFERENCES booking_packages(id) ON DELETE SET NULL,
  reminder_sent_at TIMESTAMPTZ,
  final_reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_booking_packages_status ON booking_packages (status);
CREATE INDEX idx_booking_packages_renewal_of ON booking_packages (renewal_of);

ALTER TABLE booking_packages ENABLE ROW LEVEL SECURITY;

ALTER TABLE bookings
  ADD COLUMN package_id UUID REFERENCES booking_packages(id) ON DELETE CASCADE;
CREATE INDEX idx_bookings_package_id ON bookings (package_id);

-- De boekingen van een pakket delen één Mollie-betaling (terugstorten gaat per sessie
-- als deelbedrag op die betaling), dus mollie_payment_id kan niet meer uniek zijn.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_mollie_payment_id_key;
CREATE INDEX IF NOT EXISTS idx_bookings_mollie_payment_id ON bookings (mollie_payment_id);

-- Opzeggen van een vaste reservering: het tijdslot blijft van de band tot en met het
-- einde van de laatst betaalde maand. NULL = geen doorloop (slot direct vrij).
ALTER TABLE subscriptions ADD COLUMN active_until DATE;
