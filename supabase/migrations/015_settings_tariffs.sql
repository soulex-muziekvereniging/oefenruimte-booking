-- Instelbare tarieven via het beheerpaneel (tab Instellingen). De waarden in
-- src/config.ts zijn de standaard zolang hier niets is opgeslagen. Elke wijziging komt
-- in settings_history (wie, wanneer, oud -> nieuw).
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE settings_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB NOT NULL,
  changed_by TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE settings_history ENABLE ROW LEVEL SECURITY;
