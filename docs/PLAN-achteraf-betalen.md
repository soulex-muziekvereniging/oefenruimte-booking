# Plan: vaste plek achteraf betalen + annuleren door bands

Besluit (bestuur, okt 2026): bands met een vaste plek betalen **achteraf** per periode van
4 weken, alleen voor de keren dat ze kwamen. Naast **verzetten** kunnen ze een repetitie ook
**annuleren**. Aan het einde van de periode krijgen ze een betaallink voor het bedrag.
"Vervallen bij niet betalen" blijft bestaan.

## Nog te beslissen (vraag dit eerst aan de gebruiker)
1. **Afmeldtermijn**: tot hoeveel uur/dagen van tevoren is annuleren gratis? Later annuleren
   of niet komen = wel betalen? (Advies: 7 dagen; anders blokkeert de band het dagdeel gratis.)
2. **Maximum** aantal gratis annuleringen per periode/jaar? (Advies: geen, wel de termijn.)
3. **Betaaltermijn** na de factuur (nu: vervaltermijn 14 dagen, instelbaar 7-21) en wat er
   dan vervalt (de vaste plek, zoals nu).
4. **Opslagruimte**: altijd het volle bedrag per periode (advies: ja).
5. **Overgang**: wat met periodes die al vooruitbetaald zijn? (Advies: die lopen gewoon af;
   de eerste achteraf-factuur is voor de eerste periode die nog niet betaald is.)
6. **Vrijgeven door beheer** (`by_admin`): telt als niet betalen (advies: ja, beheer beslist).

## Wat er al is en hergebruikt kan worden
- Annuleren van één keer = rij in `subscription_swaps` met `new_date = null` (bestaat al:
  beheer "Deze keer vrijgeven", migratie 018 `by_admin`). Band-annuleren wordt dezelfde rij
  met `by_admin = false`. De Borgh-werklijst en -mail pakken dit al op (`vrij:`-items).
- Betaallink + Mollie-flow per periode (`subscription_payments`, `/vaste-reservering/betalen`,
  `&direct=1`), herinnering/waarschuwing/vervallen in `/api/cron/subscriptions`.
- Prijs per keer = `subscriptionPrice` / `sessionsPerPeriod` (src/lib/tariffDefaults.ts).

## Wat er moet veranderen
1. **Cron** (`src/app/api/cron/subscriptions/route.ts`): geen periode meer 10 dagen vooruit
   factureren. Na `period_end` de periode afrekenen: bedrag = (aantal gehouden keren x prijs
   per keer) + opslag. Gehouden = keren in de periode minus annuleringen binnen de regels;
   verzette keren tellen als gehouden. `due_date` = dag na de periode, `grace_until` =
   due + vervaltermijn. 0 keren gehouden en geen opslag: periode "waived" (geen betaling).
2. **Eerste periode**: geen vooruitbetaling meer bij aanvragen (`src/app/api/subscriptions/route.ts`
   en de Mollie-webhook): de vaste plek wordt direct actief (status `active`), eerste factuur
   na de eerste periode. Let op: misbruikrisico, dus de vaste plek alleen voor leden (al zo).
3. **Annuleren door de band**: in Mijn boekingen naast "Verzetten" een knop "Annuleren"
   (met bevestigen, zoals verzetten). Nieuwe route of uitbreiding van
   `src/app/api/mijn-boekingen/subscriptions/[id]/swap` met `newDate: null`, met de
   afmeldtermijn-check. Mail naar alle bandleden (`sendRepetitionReleasedEmail` hergebruiken,
   tekst aanpassen) + `noteBorghChanges()`.
4. **Overzicht band** (Mijn boekingen): per periode tonen "x keer gerepeteerd, y geannuleerd,
   te betalen na afloop". Kalender: geannuleerde keer als "geannuleerd".
5. **Teksten**: startpagina ("Je betaalt per 4 weken vooraf" -> achteraf), bevestigingsmail,
   betaalverzoek ("over de afgelopen periode"), herinnering, handleiding (band + beheer),
   BESTUUR.md, HANDLEIDING.md, CLAUDE.md (spelregels!).
6. **Beheer**: Abonnementen/Betalingen tonen gehouden/geannuleerd per periode.
7. **Testen**: periode met 4 keer, 1 geannuleerd, 1 verzet -> 3 x prijs. Niet betalen ->
   herinnering -> vervallen. Te late annulering -> wel betalen.

## Volgorde
Beslispunten 1-6 met de gebruiker -> migratie indien nodig (bv. `subscription_payments.sessions_held`,
`sessions_cancelled` voor de factuurregel) -> cron -> annuleren-knop -> teksten -> testen ->
handleidingen/screenshots bijwerken.
