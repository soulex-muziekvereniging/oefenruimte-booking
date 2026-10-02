@AGENTS.md

# Soulex oefenruimte - projectcontext

Boekingssysteem voor de oefenruimte van Muziekvereniging Soulex (ruimte 0.37 in
gemeenschapshuis De Borgh, Budel). Leden boeken los of hebben een vaste plek; het bestuur
beheert via `/admin`. Gebruikers en beheerders zijn vrijwilligers: **eenvoudig en
storingsarm gaat boven slim**. Zeg het eerlijk als een wens het systeem niet beter maakt.

Taal: alle UI-teksten, mails en code-commentaar in het Nederlands. Bands worden met "je/jullie"
aangesproken.

## Spelregels (niet zonder overleg met het bestuur veranderen)

- **Dagdelen**: ochtend 9-13, middag 14-18, avond 19-23 (`config.dagdelen`). Alles wordt per
  dagdeel geboekt.
- **Los boeken**: per dagdeel, vooraf betalen via Mollie, maximaal `maxWeeksAhead` weken vooruit.
  Annuleren tot `cancellationCutoffHours` vooraf, met automatische terugbetaling.
- **Vaste plek** (tabel `subscriptions`): elke week of om de week hetzelfde dagdeel, vanaf een
  zelfgekozen startdatum, zonder einddatum.
  - "Om de week" telt vanaf de eigen startdatum van de band, niet vanaf weeknummers
    (`src/lib/schedule.ts`). Twee bands kunnen zo om en om hetzelfde dagdeel delen.
  - **Bands betalen altijd hetzelfde bedrag per keer oefenen.** Daarom periodes van 4 weken
    (`periodWeeks`), niet per maand: elke rekening heeft evenveel keren.
  - Geen automatische incasso. De cron zet elke periode klaar en mailt een betaalverzoek
    (10 dagen vooraf), een herinnering (+7 dagen), een waarschuwing en laat de vaste plek
    **vervallen** als er na de vervaltermijn nog niet betaald is (instelbaar 7-21 dagen,
    standaard 14). Er komt nooit een nieuwe periode zolang de vorige openstaat.
  - Verplaatsen: elk bandlid, tot 14 dagen later, 2x per periode. Beheer kan terugdraaien.
  - Bands zien hun planning een jaar vooruit in de kalender, na de laatste betaalde periode
    als "nog te betalen".
- **Opslagruimte**: ruimtes 2, 3 en 4 (1 en 5 zijn van Soulex), alleen bij een vaste plek, per
  periode van 4 weken.
- **Alleen leden** kunnen boeken. Nieuwe bands tekenen eerst een contract en betalen borg
  (buiten het systeem); pas daarna keurt beheer de aanvraag goed. Sleutels zijn fysiek
  geregeld, niet in de software.
- **Geen terugbetaling** bij vakantie of afzeggen van een vaste plek (bewuste keuze, de huur is
  laag). Bouw geen automatische verrekening zonder besluit van het bestuur.

## De Borgh (verhuurder)

De Borgh wil weten **wanneer** er iemand in de ruimte is, niet wie (in verband met calamiteiten).
Ze hebben een eigen zalenplanner (VirtueelPlein MRBS, `deborghbudel.nl/mrbs`, ruimte 0.37 =
`room=2`) zonder API of iCal-import.

- Beheer kan daar na inloggen reserveringen **toevoegen**, maar niet verwijderen: verwijderen
  gaat via mail of telefoon naar De Borgh.
- Tab Zalenplanner (`src/lib/borghSync.ts`) is een werklijst per bezet dagdeel: reeksen
  (`sub:`) en afwijkingen per datum (`extra:`, `vrij:`). Een knop opent hun formulier met
  datum en tijd ingevuld.
- Vrijgekomen tijden kunnen automatisch naar De Borgh gemaild worden: crons
  `/api/cron/borgh/*`, met een wachttijd, standaard **uit** (settings `borgh_auto`).
- Hun planner niet automatisch invullen met een bot (inloggen namens iemand, breekbaar,
  waarschijnlijk tegen hun voorwaarden).

## Techniek

- Next.js 16 (App Router) + TypeScript + Tailwind v4. In `globals.css` is het `blue`-palet
  overschreven met Soulex-petrol; accentkleur `soulex-orange`. Koppen in Zilla Slab
  (`--font-slab`), tekst in Geist.
- **Supabase** (Postgres): alleen server-side met de service-role key, RLS staat aan op alle
  tabellen. Migraties staan in `supabase/migrations/` en worden **met de hand** uitgevoerd in
  de Supabase SQL Editor (er is geen CLI-koppeling). Een nieuwe migratie dus altijd melden.
- **Mollie** voor betalingen (nog in testmodus). Webhooks: `/api/webhooks/mollie` (losse
  boekingen) en `/api/webhooks/mollie-subscription` (periodes). Mollie volgt geen redirects
  bij webhooks, dus `/api` nooit doorsturen.
- **Resend** voor mail vanaf `beheer@soulex.nl`. Altijd via `send()` in `src/lib/email.ts`
  (voegt het logo toe). Mails na een al uitgevoerde actie via `sendSafely`, zodat een
  mislukte mail de actie niet terugdraait.
- **Vercel** (team van de vereniging, Hobby). Push naar `main` = deploy. Hobby: elke cronjob
  draait hooguit 1x per dag, daarom aparte paden per tijdstip in `vercel.json`.
- Instellingen die beheer zelf wijzigt staan in tabel `settings` (met log in
  `settings_history`). Keys: `tariffs`, `whatsapp_templates`, `payment_terms`, `borgh_email`,
  `borgh_auto`, `borgh_pending`. `src/config.ts` bevat de standaardwaarden.
- Beheerders loggen in met een eigen account (`admin_users`, HMAC-sessiecookie). Bands loggen
  in met een magic link per mail (alleen e-mailadres).

## Werkafspraken

- **De repo is openbaar.** Nooit wachtwoorden, sleutels of persoonsgegevens committen.
  `TOEGANG.md` en `*.docx` blijven lokaal (staan in `.gitignore`).
- Na elke wijziging: `npx tsc --noEmit`, `npx eslint <bestanden>` en `npx next build`.
- Voor tests tegen de database: de lokale `.env.local` wijst naar de **live** database.
  Alleen lezen, tenzij expliciet anders afgesproken.
- Gegevens definitief verwijderen doet de beheerder zelf (SQL Editor), niet de assistent.
- Documentatie bijwerken bij gedragswijzigingen: `HANDLEIDING.md` (voor bands),
  `BESTUUR.md` (voor het bestuur), `README.md` (techniek).
- Windows: Python schrijft CRLF; gebruik `newline='\n'` bij scriptmatige bewerkingen.
