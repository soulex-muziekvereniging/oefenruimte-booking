import { Resend } from "resend";
import { config } from "@/config";
import { Booking } from "./supabase";

const resend = new Resend(process.env.RESEND_API_KEY!);

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("nl-NL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5);
}

function formatPrice(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export async function sendConfirmationEmail(booking: Booking) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const cancelUrl = `${appUrl}/booking/cancel?id=${booking.id}&token=${booking.cancel_token}`;

  await resend.emails.send({
    from: `${config.organizationName} <onboarding@resend.dev>`,
    to: booking.contact_email,
    subject: `Bevestiging: ${config.roomName} op ${formatDate(booking.slot_date)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Boeking bevestigd!</h2>
        <p>Hallo ${booking.contact_name},</p>
        <p>Je boeking voor <strong>${booking.band_name}</strong> is bevestigd.</p>

        <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Ruimte</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${config.roomName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Datum</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${formatDate(booking.slot_date)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Tijd</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${formatTime(booking.slot_start_time)} - ${formatTime(booking.slot_end_time)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Betaald</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${formatPrice(booking.price_cents)}</td>
          </tr>
        </table>

        <p>Moet je annuleren? Klik dan op onderstaande link:</p>
        <p><a href="${cancelUrl}">Boeking annuleren</a></p>

        <p>Met vriendelijke groet,<br>${config.organizationName}</p>
      </div>
    `,
  });
}

export async function sendCancellationNotification(booking: Booking) {
  await resend.emails.send({
    from: `${config.organizationName} <onboarding@resend.dev>`,
    to: config.organizationEmail,
    subject: `Annulering: ${booking.band_name} - ${formatDate(booking.slot_date)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Boeking geannuleerd</h2>
        <p>De volgende boeking is geannuleerd en er is een refund gestart:</p>

        <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Band</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${booking.band_name}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Contact</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${booking.contact_name} (${booking.contact_email})</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Datum</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${formatDate(booking.slot_date)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Tijd</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${formatTime(booking.slot_start_time)} - ${formatTime(booking.slot_end_time)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Bedrag</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${formatPrice(booking.price_cents)}</td>
          </tr>
        </table>

        <p>De refund wordt automatisch verwerkt via Mollie.</p>
      </div>
    `,
  });
}
