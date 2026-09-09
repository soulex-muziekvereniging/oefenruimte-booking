-- Prijs eenmalige dagdeel-boeking aangepast van €20 naar €40 (echte tarief oefenruimte)
ALTER TABLE bookings ALTER COLUMN price_cents SET DEFAULT 4000;
