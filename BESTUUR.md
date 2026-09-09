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
2. **Vaste reservering** — een band claimt structureel hetzelfde dagdeel op dezelfde weekdag
   (bijv. elke donderdagavond), wekelijks (€110/mnd) of tweewekelijks (€55/mnd). Bij het
   aangaan doet de band één keer een betaling; daarmee legt Mollie een machtiging (mandaat)
   vast waarmee **automatisch elke maand wordt geïncasseerd**, zonder dat het bestuur iets
   hoeft te doen. Opzeggen kan de band zelf via een unieke link in hun bevestigingsmail
   (geen inloggen nodig) — dit stopt de volgende incasso's.

Een dagdeel is "bezet" in de kalender zodra er óf een losse boeking op die datum staat, óf een
actieve vaste reservering die structureel die weekdag+dagdeel claimt.

**Dagdelen (vast, sluiten aan bij de huidige tarieven):**
- Ochtend 09:00–13:00
- Middag 14:00–18:00
- Avond 19:00–23:00

**Annuleren van een losse boeking:** kan tot 48 uur van tevoren, met volledige terugbetaling.
Daarna is annuleren (voorlopig) niet mogelijk via het systeem — neem dan contact op met
Kimberly, zoals nu ook al de afspraak is.

## Lidmaatschap — wél gecontroleerd, ledenlijst is simpel

Om te mogen boeken moet een band/muzikant lid zijn van Soulex (€12/jaar). Het systeem houdt
een eenvoudige ledenlijst bij (naam, e-mail, wel/niet actief lid). Een boeking wordt alleen
geaccepteerd als het e-mailadres op de ledenlijst staat. **Een bestuurslid beheert deze lijst
handmatig** in het admin-scherm (lid toevoegen zodra iemand betaald heeft, uitzetten als het
lidmaatschap niet verlengd wordt).

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
