# Oefenruimte Boekingssysteem — Soulex.nl

Online boekingssysteem voor de muziekstichting. Bands kunnen een oefenruimte boeken, betalen via Mollie, en annuleren met automatische refund.

## Hoe het werkt

```
Band bezoekt website
       │
       ▼
Weekoverzicht met beschikbare tijdslots (groen = vrij, grijs = bezet)
       │
       ▼ klikt op een slot
Boekingsformulier: bandnaam, contactpersoon, e-mail, telefoon
       │
       ▼ verstuurt
Redirect naar Mollie betaalpagina
       │
       ▼ betaling geslaagd
Boeking definitief + 2 e-mails:
  1. Bevestigingsmail naar de band (met annuleringslink)
  2. Notificatie naar de organisatie

Annulering:
  Band klikt annuleringslink in e-mail → bevestigt → automatische refund via Mollie
  → Organisatie krijgt e-mail over de annulering
```

## Tech Stack

| Component | Service | Kosten |
|-----------|---------|--------|
| Frontend + API | **Next.js** (TypeScript) op **Vercel** | Gratis (hobby tier) |
| Database | **Supabase** (PostgreSQL) | Gratis (free tier) |
| Betalingen | **Mollie** | ~€0,29 per transactie |
| E-mail | **Resend** | Gratis (3000 mails/maand) |
| Code | **GitHub** (private repo) | Gratis |

## Projectstructuur

```
src/
├── config.ts                    ← ALLE configureerbare variabelen (prijs, tijden, etc.)
├── app/
│   ├── page.tsx                 ← Hoofdpagina: weekkalender + boekingsformulier
│   ├── layout.tsx               ← Layout: header, footer, NL taalinstellingen
│   ├── booking/
│   │   ├── success/page.tsx     ← Bevestigingspagina na betaling
│   │   └── cancel/page.tsx      ← Annuleringspagina
│   └── api/
│       ├── slots/route.ts       ← GET: beschikbare tijdslots ophalen
│       ├── bookings/route.ts    ← POST: boeking aanmaken + Mollie betaling starten
│       ├── bookings/[id]/cancel/route.ts ← POST: annulering + refund
│       └── webhooks/mollie/route.ts      ← POST: Mollie meldt betaalstatus
└── lib/
    ├── supabase.ts              ← Database client + types
    ├── mollie.ts                ← Mollie betaal-client
    ├── email.ts                 ← E-mail templates (bevestiging, annulering, org-notificatie)
    └── slots.ts                 ← Logica: slots genereren op basis van config
```

## Configuratie aanpassen

Alle instellingen staan in één bestand: **`src/config.ts`**

```ts
export const config = {
  roomName: "Oefenruimte",              // Naam van de ruimte
  pricePerSlotCents: 2000,               // Prijs per slot in centen (€20,00)
  slotDurationMinutes: 120,              // Duur per slot (2 uur)
  operatingHours: { start: 10, end: 22 },  // Openingstijden (10:00 - 22:00)
  operatingDays: [0, 1, 2, 3, 4, 5, 6],    // Beschikbare dagen (0=zo t/m 6=za)
  maxWeeksAhead: 4,                      // Hoeveel weken vooruit boeken
  organizationEmail: "info@soulex.nl",   // E-mail voor notificaties aan organisatie
  organizationName: "Muziekstichting",   // Naam organisatie (in e-mails)
  currency: "EUR",                       // Valuta
  pendingExpiryMinutes: 15,              // Hoe lang een onbetaalde boeking geldig is
};
```

Na het wijzigen: commit + push naar GitHub → Vercel deployed automatisch.

## Database

Eén tabel `bookings` in Supabase (PostgreSQL). Schema staat in `supabase/migrations/001_create_bookings.sql`.

Statussen van een boeking:
- `pending` → boeking aangemaakt, wacht op betaling
- `confirmed` → betaling geslaagd, boeking definitief
- `expired` → betaling niet ontvangen binnen 15 minuten
- `cancelled` → band heeft geannuleerd, refund gestart

## Accounts & Toegang

| Service | Ingelogd via | Dashboard |
|---------|-------------|-----------|
| Vercel | Google (stanislaav@gmail.com) | vercel.com/dashboard |
| Supabase | GitHub (Stanislaav666) | supabase.com/dashboard |
| Mollie | Eigen account | my.mollie.com |
| Resend | Eigen account | resend.com |
| GitHub | Stanislaav666 | github.com/Stanislaav666/oefenruimte-booking (private) |

## Environment Variables

Deze staan ingesteld in Vercel (Settings → Environment Variables):

| Variable | Wat het is | Waar te vinden |
|----------|-----------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://janjxrnrscnlbrpvtnhi.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key | Supabase → API Keys → Legacy tab → service_role |
| `MOLLIE_API_KEY` | Mollie API key | Mollie → Developers → API keys |
| `RESEND_API_KEY` | Resend API key | Resend → API Keys |
| `NEXT_PUBLIC_APP_URL` | De URL van de live site | De Vercel deployment URL |

**Let op:** `SUPABASE_SERVICE_ROLE_KEY` is een geheime key met volledige database-toegang. Deel deze nooit publiek.

---

## Wat er nog moet gebeuren om LIVE te gaan

### 1. DNS-records toevoegen voor e-mail (Resend + soulex.nl)

Het domein `soulex.nl` is toegevoegd in Resend, maar de DNS-records moeten nog worden ingesteld bij de domeinprovider. Zonder dit kunnen e-mails alleen naar het Resend-accountadres gestuurd worden.

**Toe te voegen DNS-records:**

| Type | Name | Content | TTL |
|------|------|---------|-----|
| TXT | `resend._domainkey` | *(volledige waarde uit Resend dashboard)* | Auto |
| CNAME | `rsend` | *(waarde uit Resend dashboard)* | Auto |
| CNAME | `send` | *(waarde uit Resend dashboard)* | Auto |

De exacte waarden staan in het Resend dashboard onder Domains → soulex.nl.

Na het toevoegen: klik in Resend op "I've added the records" → wacht op verificatie (kan tot 48 uur duren, meestal sneller).

### 2. E-mail afzender updaten in code

Zodra het domein geverifieerd is in Resend, moet de afzender in `src/lib/email.ts` worden aangepast:

Verander (3x in het bestand):
```
from: `${config.organizationName} <onboarding@resend.dev>`
```
Naar:
```
from: `${config.organizationName} <boekingen@soulex.nl>`
```

### 3. Mollie live zetten

1. Verifieer het Mollie-account met KVK-gegevens van de stichting
2. Maak een **Live API key** aan in Mollie (Developers → API keys → Livemodus)
3. Vervang de `MOLLIE_API_KEY` in Vercel door de live key
4. Test een echte betaling

### 4. NEXT_PUBLIC_APP_URL instellen

Zorg dat `NEXT_PUBLIC_APP_URL` in Vercel is ingesteld op de definitieve URL van de site. Dit is nodig voor:
- Mollie webhooks (betaalstatus terugkoppeling)
- Annuleringslinks in e-mails
- Redirect na betaling

### 5. Organisatie e-mailadres instellen

Pas `organizationEmail` in `src/config.ts` aan naar het echte e-mailadres van de stichting (bijv. `info@soulex.nl`).

### 6. (Optioneel) Eigen domein koppelen aan Vercel

In Vercel → Settings → Domains kun je `soulex.nl` of `boeken.soulex.nl` koppelen als custom domain in plaats van de `.vercel.app` URL.

---

## Lokaal ontwikkelen

```bash
# Dependencies installeren
npm install

# Kopieer env template en vul waarden in
cp .env.example .env.local

# Dev server starten
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Testen met Mollie

In test mode kun je betalen met testkaarten zonder echt geld. De Mollie test-modus werkt automatisch als je een `test_...` API key gebruikt.

Zie de Mollie documentatie voor testkaarten en testscenario's.

## Deployen

Elke push naar de `master` branch op GitHub triggert automatisch een nieuwe deployment op Vercel. Geen handmatige actie nodig.
