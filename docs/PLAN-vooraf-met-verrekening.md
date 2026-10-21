# Vaste plek: vooraf betalen met verrekening

Besluit bestuur, 21 oktober 2026. Vervangt `PLAN-achteraf-betalen.md` (dat model heeft kort
live gestaan, zonder echte bands).

## Regels
- Periode = 4 weken vanaf de startdatum van de band (zoals altijd).
- De rekening voor een periode gaat **een week voor de periode** uit
  (`config.subscriptionInvoiceDaysBefore`). De vervaltermijn telt vanaf de rekening.
- **Annuleren en verzetten** van één keer: tot **72 uur** van tevoren (instelbaar in beheer,
  `payment_terms.cancelHours`). Losse boekingen blijven 48 uur.
- Annuleren zonder maximum. Een geannuleerde keer:
  - waarvan de rekening nog niet verstuurd is: komt er niet op;
  - die al op een rekening stond: wordt **gekort op de volgende rekening**.
- Door beheer vrijgegeven keren werken hetzelfde.
- Opslag: altijd het volle bedrag per periode.
- Opzeggen door de band: de plek loopt door t/m de laatste betaalde periode. Tegoed dat nog
  niet verrekend is, betaalt het bestuur **handmatig terug**; het bedrag staat in de melding.

## Techniek
- `src/lib/billing.ts`: `buildInvoice` (keren x prijs + opslag - tegoed, nooit onder 0;
  restend tegoed schuift door), `openCredits` (geannuleerd na het aanmaken van de rekening
  van die periode, `credited_in` leeg), `nextBillingPeriod`, `invoiceDue`.
- Cron `/api/cron/subscriptions`: rekening klaarzetten, `credited_in` vullen, mailen.
- Migratie 021: `subscription_payments.credit_sessions/credit_cents`,
  `subscription_swaps.credited_in`.
- `src/lib/credit.ts`: openstaand tegoed bij opzeggen (melding aan het bestuur).
