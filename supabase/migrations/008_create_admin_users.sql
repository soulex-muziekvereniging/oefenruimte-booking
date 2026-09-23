-- Vervangt het ene gedeelde ADMIN_PASSWORD-env-var door echte, resetbare accounts.
-- password_hash is NULL zolang er nog geen wachtwoord gekozen is - het "wachtwoord
-- vergeten"-formulier stuurt in dat geval gewoon een link om er voor het eerst een
-- in te stellen (zelfde flow als een echte reset, geen apart pad nodig).

CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Eerste account, zonder wachtwoord - wordt bij de allereerste keer via de
-- "wachtwoord vergeten"-link op de site ingesteld.
INSERT INTO admin_users (email) VALUES ('beheer@soulex.nl');
