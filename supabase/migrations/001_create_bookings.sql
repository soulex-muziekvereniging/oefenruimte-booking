CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  slot_date DATE NOT NULL,
  slot_start_time TIME NOT NULL,
  slot_end_time TIME NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 2000,
  status TEXT NOT NULL DEFAULT 'pending',
  mollie_payment_id TEXT UNIQUE,
  cancel_token UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX unique_active_booking
  ON bookings (slot_date, slot_start_time)
  WHERE status IN ('pending', 'confirmed');

CREATE INDEX idx_bookings_status ON bookings (status);
CREATE INDEX idx_bookings_slot_date ON bookings (slot_date);
