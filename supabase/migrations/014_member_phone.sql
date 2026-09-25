-- Telefoonnummer per lid, zichtbaar en aanpasbaar in de ledenlijst van het beheerpaneel.
-- Regel (bestuur): minimaal één nummer per band - afgedwongen in de app.
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone TEXT;
