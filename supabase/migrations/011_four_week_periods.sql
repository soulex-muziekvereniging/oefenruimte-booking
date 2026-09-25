-- Nieuw model vaste reservering (feedback bestuur, sep 2026):
-- * elke week of om de week, vanaf een zelfgekozen startdatum (start_date)
-- * betalen per periode van 4 weken i.p.v. per kalendermaand (period_start/period_end)
-- * "om de week" vervangt het pakket - twee bands kunnen een dagdeel om en om delen,
--   dus de unieke index op weekdag+dagdeel verdwijnt (de app controleert botsingen zelf,
--   zie src/lib/schedule.ts).

ALTER TABLE subscriptions ADD COLUMN start_date DATE;
UPDATE subscriptions SET start_date = COALESCE(term_start_date, created_at::date);

DROP INDEX IF EXISTS unique_active_subscription_slot;

ALTER TABLE subscription_payments RENAME COLUMN period_month TO period_start;
ALTER TABLE subscription_payments ADD COLUMN period_end DATE;
UPDATE subscription_payments
  SET period_end = (period_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
ALTER TABLE subscription_payments ALTER COLUMN period_end SET NOT NULL;

ALTER TABLE subscription_swaps RENAME COLUMN period_month TO period_start;

-- Pakketten zijn vervangen door "om de week" (er stonden er geen in).
ALTER TABLE bookings DROP COLUMN IF EXISTS package_id;
DROP TABLE IF EXISTS booking_packages;
