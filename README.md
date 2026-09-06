# Oefenruimte Boekingssysteem

Online boekingssysteem voor een muziekstichting. Bands kunnen een oefenruimte boeken, betalen via Mollie, en annuleren met automatische refund.

## Tech Stack

- **Next.js** (TypeScript) — frontend + API
- **Supabase** — PostgreSQL database
- **Mollie** — betalingen
- **Resend** — transactionele e-mail
- **Vercel** — hosting

## Setup

### 1. Accounts aanmaken (gratis)

| Service | URL | Wat je nodig hebt |
|---------|-----|-------------------|
| Supabase | supabase.com | Project URL + Service Role Key |
| Mollie | mollie.com | API key (test mode) |
| Resend | resend.com | API key |
| Vercel | vercel.com | GitHub koppeling |

### 2. Database opzetten

1. Maak een nieuw project aan in Supabase
2. Ga naar **SQL Editor** in het Supabase dashboard
3. Plak de inhoud van `supabase/migrations/001_create_bookings.sql` en voer uit

### 3. Environment variables

Kopieer `.env.example` naar `.env.local` en vul de waarden in:

```bash
cp .env.example .env.local
```

| Variable | Waar te vinden |
|----------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key |
| `MOLLIE_API_KEY` | Mollie → Dashboard → Developers → API keys |
| `RESEND_API_KEY` | Resend → API Keys |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` (lokaal) of je Vercel URL |

### 4. Lokaal draaien

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Deployen naar Vercel

1. Push de code naar GitHub
2. Importeer het project in Vercel
3. Voeg de environment variables toe in Vercel → Settings → Environment Variables
4. Deploy!

**Belangrijk:** Stel `NEXT_PUBLIC_APP_URL` in op je Vercel URL (bijv. `https://oefenruimte.vercel.app`) zodat Mollie webhooks correct werken.

### 6. Mollie live zetten

1. Verifieer je Mollie-account (KVK-gegevens nodig)
2. Vervang de test API key door de live API key
3. Test een echte betaling

## Configuratie aanpassen

Alle configureerbare instellingen staan in `src/config.ts`:

```ts
export const config = {
  roomName: "Oefenruimte",         // naam van de ruimte
  pricePerSlotCents: 2000,          // prijs in centen (€20,00)
  slotDurationMinutes: 120,         // duur per slot (2 uur)
  operatingHours: { start: 10, end: 22 },  // openingstijden
  operatingDays: [0, 1, 2, 3, 4, 5, 6],    // 0=zo, 1=ma, ..., 6=za
  maxWeeksAhead: 4,                 // hoeveel weken vooruit boeken
  organizationEmail: "info@...",    // e-mail voor annuleringsmeldingen
  organizationName: "Muziekstichting",
  currency: "EUR",
  pendingExpiryMinutes: 15,         // hoe lang een onbetaalde boeking geldig is
};
```

## Testen met Mollie

In test mode kun je betalen met testkaarten. Zie [Mollie test mode docs](https://docs.mollie.com/overview/testing).
