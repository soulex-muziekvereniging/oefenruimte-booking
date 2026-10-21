# Boekingssysteem oefenruimte — proces & besluiten voor het bestuur

Dit document legt uit hoe het nieuwe boekingssysteem voor de oefenruimte gaat werken, welke
keuzes daarin al gemaakt zijn, en welke stappen buiten het systeem om handmatig blijven
(voorlopig). Bedoeld om te delen met bestuursleden die niet bij de opzet betrokken waren.

**Status: in ontwikkeling, draait nog in een testomgeving. Nog niet live op soulex.nl.**

## Wat het systeem gaat doen

Bands kunnen via een website (los van soulex.nl, met een link/knop erop) een dagdeel in de
oefenruimte boeken, zonder in te hoeven loggen. Twee soorten boekingen:

1. **Losse boeking** — eenmalig een vrij dagdeel huren, prijs €40, direct afgerekend via Mollie
   (iDEAL e.d.). Bevestiging per e-mail met een unieke link om te annuleren.
2. **Vaste reservering** — een band claimt hetzelfde dagdeel **elke week** of **om de
   week**, vanaf een zelfgekozen startdatum; €30 per keer (€120 per 4 weken bij elke week).
   "Om de week" telt vanaf de eigen startdatum van de band (geen weeknummers), zodat twee
   bands een dagdeel om en om kunnen delen.

   **Vooraf betalen met verrekening** (besluit bestuur, 21 oktober 2026): bij het aanvragen
   betaalt de band niets, de vaste plek is meteen actief. Een week voor elke periode van 4
   weken krijgt de band (en alle bekende bandleden) een rekening per e-mail. Er is **geen
   automatische incasso**. Een band kan een repetitie zelf **annuleren** of **verzetten** tot
   de **afmeldtermijn** (standaard 72 uur van tevoren, instelbaar onder Instellingen).
   Annuleren kan zo vaak als nodig: was de rekening voor die periode nog niet verstuurd, dan
   komt de keer er niet op; anders wordt hij **gekort op de volgende rekening**. Later
   afzeggen of niet komen wordt wel gerekend. Verzetten (naar elk vrij dagdeel tot 14 dagen
   later) kan 2x per 4 weken; een verzette keer wordt gewoon gerekend. Een keer die het
   bestuur vrijgeeft ("Deze keer vrijgeven") wordt net zo verrekend. Losse boekingen blijven
   48 uur.

   Is een rekening na de **vervaltermijn** (standaard 14 dagen, instelbaar) nog niet betaald,
   dan vervalt de vaste plek en komt het dagdeel vrij. **Opslagruimte** (ruimte 2, 3 en 4; 1 en 5 zijn van Soulex) kan erbij voor €15 per 4
   weken, altijd het volle bedrag, op dezelfde rekening; het bestuur kan in het admin-scherm
   per reservering een ruimte toekennen of weghalen. Opzeggen kan de band zelf via een unieke
   link in hun bevestigingsmail (geen inloggen nodig); het slot blijft dan van hen tot het
   einde van de laatst betaalde periode. Opzeggen via het admin-scherm geeft het slot direct
   vrij. Heeft de band nog **tegoed** van geannuleerde keren dat nog niet verrekend is, dan
   staat het bedrag in de melding aan het bestuur; dat betaal je **handmatig terug**.

   Dit draait op één dagelijkse achtergrondtaak (Vercel Cron, `/api/cron/subscriptions`) die
   rekeningen klaarzet (met verrekening), herinneringen stuurt en vervallen tijdsloten
   vrijgeeft. Dat gebeurt pas als in beheer > Instellingen de schakelaar **Rekeningen vaste
   plek** aan staat (standaard uit). Daar kies je ook **Factureren vanaf**: elke band krijgt
   een rekening voor de eerste periode die op of na die datum begint; repetities daarvoor
   regelen jullie zoals vóór het systeem. In het
   admin-scherm kan een bestuurslid een periode **kwijtschelden** (bijv. bij vakantie, geen
   betaling nodig maar tijdslot blijft staan) of de **coulance met 14 dagen verlengen** (bij
   een goed verhaal) — bewust handmatige hendels, geen automatische regels.

Een dagdeel is "bezet" in de kalender zodra er óf een losse boeking op die datum staat, óf een
actieve vaste reservering die structureel die weekdag+dagdeel claimt.

**Dagdelen (vast, sluiten aan bij de huidige tarieven):**
- Ochtend 09:00–13:00
- Middag 14:00–18:00
- Avond 19:00–23:00

**Annuleren van een losse boeking:** kan tot 48 uur van tevoren, met volledige terugbetaling.
Daarna is annuleren (voorlopig) niet mogelijk via het systeem — neem dan contact op met
Kimberly, zoals nu ook al de afspraak is.

## Betalingen en boekjaar (voor de penningmeester)

In het beheer staat onder **Betalingen** een overzicht per boekjaar: elke betaalperiode van
een vaste reservering en elke online betaalde losse boeking, met band, bedrag, status en wie
er betaald heeft. Met **Download (Excel)** haal je het hele boekjaar binnen voor de
jaarafrekening of de kascommissie. Een betaling telt in het boekjaar waarin hij binnenkwam.
Bij een nieuw boekjaar begint het overzicht vanzelf leeg; er wordt niets verwijderd (oudere
jaren blijven op te vragen, de administratie moet een aantal jaren bewaard blijven). In welke
maand het boekjaar begint, stel je in onder Instellingen (standaard januari).

**Als een betaling niet via de site loopt**, gebruik je de knoppen bij de regel (filter
"Af te handelen"):
- **Handmatig betaald**: contant of per overboeking betaald. Je vult in hoe; de band krijgt
  de gewone bevestiging.
- **Kwijtschelden**: niet meer innen, met een reden. Die reden staat in het overzicht en in
  de export.

Een afgebroken online betaling hoef je niet op te ruimen: na 15 minuten vervalt die vanzelf
en komt het dagdeel weer vrij. Vervalt een vaste reservering terwijl er nog een rekening open
stond, dan staat die als **vervallen**: telt niet meer als "open", maar blijft zichtbaar tot
je hem afhandelt. De laatste rekening na opzeggen staat gewoon als "open".

Bij elke rekening staat hoe vaak de band kwam en hoe vaak er op tijd geannuleerd is (ook in
de export). Een periode zonder repetities en zonder opslag krijgt geen rekening; die staat
als kwijtgescholden ("Geen repetities in deze periode").

## Lidmaatschap — wél gecontroleerd, ledenlijst is simpel

Om te mogen boeken moet een band/muzikant lid zijn van Soulex (€12/jaar). Het systeem houdt
een eenvoudige ledenlijst bij (naam, e-mail, wel/niet actief lid). Een boeking wordt alleen
geaccepteerd als het e-mailadres op de ledenlijst staat. **Een bestuurslid beheert deze lijst
handmatig** in het admin-scherm (lid toevoegen zodra iemand betaald heeft, uitzetten als het
lidmaatschap niet verlengd wordt).

## Sleutels en alarmtags

In het beheer staat onder **Sleutels** wie welke sleutel en alarmtag heeft, welke nog niet
uitgegeven zijn (en waar ze liggen) en welke verloren/geblokkeerd zijn. Gebruik bij "Bij" de
bandnaam uit de ledenlijst: dan staat het sleutelnummer ook bij die band (Leden en
Abonnementen), en waarschuwt het overzicht als een band geen actief lid meer is. De sleutels
zelf, de borg en het blokkeren van een tag blijven fysiek geregeld; dit is alleen het
overzicht. Bands zien het nooit.

## Wat bewust BUITEN het systeem blijft (voorlopig)

Deze twee dingen zijn methodisch werk die per band maar 1x per situatie voorkomt en daarom nog
niet automatisch geregeld wordt in de eerste versie:

- **Borg (€150) voor sleutel + gebruik materialen** — dit hoort bij de fysieke overdracht van
  de sleutel en blijft geregeld zoals nu: persoonlijk via Kimberly/Teun, buiten het
  boekingssysteem om. Het systeem toont bij een vaste reservering wel een melding dat de borg
  nog geregeld moet worden, maar incasseert of registreert 'm niet.
- **Jaarlijks lidmaatschap (€12/jaar)** — dit loopt al via een bestaande automatische incasso
  buiten dit systeem om. Het boekingssysteem *checkt* alleen of iemand op de ledenlijst staat;
  het int het lidmaatschapsgeld niet en bewaakt ook geen vervaldatum automatisch. Een
  bestuurslid moet de ledenlijst dus zelf actueel houden.
- **Opbergruimte (€12,50/maand)** — komt in een latere versie; nu nog niet boekbaar via het
  systeem, blijft zoals nu apart geregeld.

Deze punten kunnen later alsnog geautomatiseerd worden zonder dat het systeem opnieuw
opgebouwd hoeft te worden — het datamodel houdt daar rekening mee.

## Wie doet wat (rollen)

| Taak | Wie |
|------|-----|
| Ledenlijst actueel houden in admin-scherm | Bestuurslid (nu: rol van Kimberly) |
| Sleuteloverdracht + borg innen | Kimberly / Teun, persoonlijk |
| Technische vragen oefenruimte | Teun |
| Beheer van de website-accounts (Vercel/Supabase/Mollie/Resend/GitHub) | Nog te beleggen bij migratie naar verenigingsaccounts |
| Bij problemen met een boeking/betaling | Admin-scherm van het systeem (`/admin`) |

## Openstaande punten richting livegang

- Officiële naam + eventueel KVK-nummer van de vereniging (nodig voor het zakelijke
  Mollie-account)
- Wie van het bestuur krijgt toegang tot welke nieuwe accounts, en hoe wordt dat wachtwoord
  gedeeld (aanbevolen: een gedeelde wachtwoordkluis, bijv. Bitwarden, i.p.v. persoonlijke
  accounts van één bestuurslid)
- Definitieve tekst/plek van de knop op soulex.nl naar de boekingspagina

Zie ook de sectie "Wat er nog moet gebeuren om LIVE te gaan" in [README.md](README.md) voor de
technische livegang-checklist (DNS, live Mollie-key, domeinkoppeling).
