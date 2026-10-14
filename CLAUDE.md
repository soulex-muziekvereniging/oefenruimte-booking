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
  - **Achteraf betalen** (besluit bestuur okt 2026, `docs/PLAN-achteraf-betalen.md`): de
    vaste plek is direct actief zonder betaling. Na elke periode van 4 weken (`periodWeeks`)
    rekent de cron af (`src/lib/billing.ts`): gehouden keren x prijs per keer (= price_cents
    min opslag, gedeeld door sessionsPerPeriod) + altijd de volle opslag. Factuurregel in
    `subscription_payments.sessions_held` e.a. (migratie 019). 0 euro = "waived".
  - Geen automatische incasso. Rekening na afloop, herinnering (+7 dagen), waarschuwing, en
    de vaste plek **vervalt** als er na de vervaltermijn nog niet betaald is (instelbaar 7-21
    dagen, standaard 14).
  - **Annuleren** van één keer door de band: tot de afmeldtermijn (instelbaar 2-14 dagen,
    standaard 7, settings `payment_terms.cancelDays`), geen maximum; rij in
    `subscription_swaps` zonder nieuwe datum. Geannuleerd (band) en vrijgegeven (beheer,
    `by_admin`) worden niet gerekend. Een al verzette keer kan de band niet annuleren.
  - Verplaatsen: elk bandlid, tot 14 dagen later, 2x per periode (annuleringen tellen niet
    mee). Een verzette keer wordt gerekend. Beheer kan terugdraaien.
  - Opzeggen: slot direct vrij (behalve een nog lopende vooruitbetaalde periode), laatste
    rekening t/m `subscriptions.bill_until`.
  - Bands zien hun planning een jaar vooruit in de kalender.
- **Opslagruimte**: ruimtes 2, 3 en 4 (1 en 5 zijn van Soulex), alleen bij een vaste plek, per
  periode van 4 weken, altijd het volle bedrag.
- **Alleen leden** kunnen boeken. Nieuwe bands tekenen eerst een contract en betalen borg
  (buiten het systeem); pas daarna keurt beheer de aanvraag goed. Sleutels zijn fysiek
  geregeld, niet in de software.
- Te laat afzeggen of niet komen bij een vaste plek wordt gewoon gerekend. Bouw geen andere
  verrekening zonder besluit van het bestuur.

## De Borgh (verhuurder)

De Borgh wil weten **wanneer** er iemand in de ruimte is, niet wie (in verband met calamiteiten).
Ze hebben een eigen zalenplanner (VirtueelPlein MRBS, `deborghbudel.nl/mrbs`, ruimte 0.37 =
`room=2`) zonder API of iCal-import.

- Beheer kan daar na inloggen reserveringen **toevoegen**, maar niet verwijderen: verwijderen
  gaat via mail of telefoon naar De Borgh.
- Tab Zalenplanner (`src/lib/borghSync.ts`) is een werklijst per bezet dagdeel: reeksen
  (`sub:`) en afwijkingen per datum (`extra:`, `vrij:`). Een knop opent hun formulier met
  datum en tijd ingevuld.
- Vrijgekomen tijden kunnen automatisch naar De Borgh gemaild worden, standaard **uit**
  (settings `borgh_auto`): gaat het om vandaag, dan meteen bij de annulering
  (`noteBorghChanges`); anders de volgende ochtend in één mail (cron `/api/cron/borgh/ochtend`).
  Tekst instelbaar (settings `borgh_mail_text`).
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
  `settings_history`). Keys: `tariffs`, `whatsapp_templates`, `payment_terms` (graceDays, cancelDays), `borgh_email`,
  `borgh_auto`, `borgh_mail_text`, `fiscal_year` (startmaand boekjaar). `src/config.ts` bevat de standaardwaarden.
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
