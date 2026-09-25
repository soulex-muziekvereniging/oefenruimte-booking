-- Wie de meldingen voor het bestuur krijgt, beheerbaar via het beheerpaneel (tab
-- Instellingen) in plaats van via config.ts + deploy. Leeg = alles naar beheer@soulex.nl.
CREATE TABLE notification_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;

INSERT INTO notification_recipients (email) VALUES ('beheer@soulex.nl');

-- Tweede beheerder. Stelt haar eigen wachtwoord in via "Wachtwoord vergeten" op
-- /admin/login - de link komt in haar eigen mailbox.
INSERT INTO admin_users (email) VALUES ('kimberly@soulex.nl') ON CONFLICT (email) DO NOTHING;
