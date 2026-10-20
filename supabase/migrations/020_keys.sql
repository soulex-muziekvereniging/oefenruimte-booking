-- Sleuteloverzicht (beheer > Sleutels): welke sleutel en alarmtag heeft wie.
-- holder = bandnaam (zoals in de ledenlijst) of vrije tekst, bv. "Soulex (Kimberly)";
-- leeg = niet uitgegeven. Alleen voor beheer; bands zien dit nooit.
CREATE TABLE IF NOT EXISTS keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_number TEXT NOT NULL UNIQUE,
  alarm_tag TEXT,
  holder TEXT,
  status TEXT NOT NULL DEFAULT 'uitgegeven', -- uitgegeven | beschikbaar | geblokkeerd
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE keys ENABLE ROW LEVEL SECURITY;
