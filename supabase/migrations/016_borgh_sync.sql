-- Werklijst "Zalenplanner": wat is al overgenomen in de zalenplanner van De Borgh?
-- Per item (vaste reservering, losse boeking, verplaatsing) de toestand zoals die is
-- overgenomen; verschilt de huidige toestand, dan komt het item terug op de werklijst.
CREATE TABLE borgh_sync (
  item_key TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  description TEXT NOT NULL,
  ends_on DATE,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  synced_by TEXT
);
ALTER TABLE borgh_sync ENABLE ROW LEVEL SECURITY;
