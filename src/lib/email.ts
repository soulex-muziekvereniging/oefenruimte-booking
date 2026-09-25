import { Resend } from "resend";
import { getOrgRecipients } from "./notifications";
import { formatRhythm } from "./schedule";
import { config } from "@/config";
import {
  Booking,
  Subscription,
  MembershipRequest,
  SubscriptionPayment,
} from "./supabase";

function dagdeelLabel(dagdeelId: string): string {
  return config.dagdelen.find((d) => d.id === dagdeelId)?.label.toLowerCase() ?? dagdeelId;
}

const resend = new Resend(process.env.RESEND_API_KEY!);

// Resend gooit geen exception bij een mislukte verzending maar geeft {error} terug -
// zonder deze check mislukt een mail stil en denkt de aanroeper dat hij verstuurd is.
// Elke mail krijgt bovenaan het Soulex-logo, zodat bands meteen zien van wie hij komt.
function withBranding(html: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  return `
    <div style="max-width: 600px; margin: 0 auto; padding: 16px 0 12px; border-bottom: 3px solid #f66a10;">
      <img src="${appUrl}/soulex-wordmark.png" alt="Soulex" width="140" style="display: block; height: auto;">
    </div>
    ${html}`;
}

async function send(payload: Parameters<typeof resend.emails.send>[0]) {
  if ("html" in payload && typeof payload.html === "string") {
    payload = { ...payload, html: withBranding(payload.html) };
  }
  const { error } = await resend.emails.send(payload);
  if (error) throw new Error(`E-mail versturen mislukt: ${error.message}`);
}

// Voor mails ná een al doorgevoerde wijziging: een mislukte mail mag de actie zelf niet
// alsnog laten mislukken, maar moet wel zichtbaar zijn in de Vercel-logs.
export async function sendSafely(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    console.error(`[e-mail] ${label} mislukt:`, err);
  }
}

// Voor situaties die een mens moet oppakken (bv. een betaling die binnenkwam voor een
// inmiddels vergeven slot) - komt bij dezelfde ontvangers als de boekingsmeldingen.
export async function sendAdminAlertToOrg(subject: string, message: string) {
  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: await getOrgRecipients(),
    subject: `Actie nodig: ${subject}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Actie nodig</h2>
        <p>${message}</p>
      </div>
    `,
  });
}

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

// "elke maandagavond" of "om de week op maandagavond".
function formatWeekdayDagdeel(subscription: Subscription): string {
  return formatRhythm(subscription);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatPeriod(periodPayment: Pick<SubscriptionPayment, "period_start" | "period_end">): string {
  const short = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  return `${short(periodPayment.period_start)} t/m ${short(periodPayment.period_end)}`;
}

export async function sendConfirmationEmail(booking: Booking, extraRecipients: string[] = []) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const cancelUrl = `${appUrl}/booking/cancel?id=${booking.id}&token=${booking.cancel_token}`;
  const recipients = Array.from(
    new Set([booking.contact_email, ...extraRecipients])
  );

  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: recipients,
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

        <p>Moet je annuleren? Dat kan tot uiterlijk ${config.cancellationCutoffHours} uur van tevoren via onderstaande link:</p>
        <p><a href="${cancelUrl}">Boeking annuleren</a></p>

        <p>Met vriendelijke groet,<br>${config.organizationName}</p>
      </div>
    `,
  });
}

export async function sendBookingNotificationToOrg(booking: Booking) {
  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: await getOrgRecipients(),
    subject: `Nieuwe boeking: ${booking.band_name} - ${formatDate(booking.slot_date)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Nieuwe boeking ontvangen</h2>
        <p>Er is een nieuwe boeking bevestigd en betaald:</p>

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
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Telefoon</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${booking.contact_phone || "-"}</td>
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
      </div>
    `,
  });
}

export async function sendCancellationNotification(booking: Booking, refunded: boolean) {
  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: await getOrgRecipients(),
    subject: `Annulering: ${booking.band_name} - ${formatDate(booking.slot_date)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Boeking geannuleerd</h2>
        <p>De volgende boeking is geannuleerd${refunded ? " en er is een refund gestart" : ""}:</p>

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

        <p>${
          refunded
            ? "De refund wordt automatisch verwerkt via Mollie."
            : "Er is niets via Mollie teruggestort (niet online betaald, of terugstorten is overgeslagen)."
        }</p>
      </div>
    `,
  });
}

export async function sendBookingCancelledConfirmationEmail(
  booking: Booking,
  refunded: boolean,
  extraRecipients: string[] = []
) {
  const recipients = Array.from(new Set([booking.contact_email, ...extraRecipients]));

  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: recipients,
    subject: `Geannuleerd: ${config.roomName} op ${formatDate(booking.slot_date)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Boeking geannuleerd</h2>
        <p>Hallo,</p>
        <p>De boeking van <strong>${booking.band_name}</strong> op <strong>${formatDate(booking.slot_date)}</strong>
        (${formatTime(booking.slot_start_time)} - ${formatTime(booking.slot_end_time)}) is geannuleerd.</p>
        <p>${
          refunded
            ? `Het bedrag van ${formatPrice(booking.price_cents)} wordt teruggestort; dat duurt meestal een paar werkdagen.`
            : "Er wordt niets teruggestort."
        }</p>
        <p>Klopt dit niet? Mail dan naar <a href="mailto:${config.organizationEmail}">${config.organizationEmail}</a>.</p>
        <p>Met vriendelijke groet,<br>${config.organizationName}</p>
      </div>
    `,
  });
}

export async function sendSubscriptionConfirmationEmail(
  subscription: Subscription,
  extraRecipients: string[] = []
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const cancelUrl = `${appUrl}/subscription/cancel?id=${subscription.id}&token=${subscription.cancel_token}`;
  const recipients = Array.from(
    new Set([subscription.contact_email, ...extraRecipients])
  );

  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: recipients,
    subject: `Vaste reservering bevestigd: ${config.roomName} ${formatWeekdayDagdeel(subscription)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Vaste reservering bevestigd!</h2>
        <p>Hallo ${subscription.contact_name},</p>
        <p><strong>${capitalize(formatWeekdayDagdeel(subscription))}</strong> is van <strong>${subscription.band_name}</strong>,
        vanaf ${formatDate(subscription.start_date)}. Zolang jullie op tijd betalen, blijft dat
        tijdslot voor jullie gereserveerd - we geven het niet aan een andere band.</p>

        <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Ruimte</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${config.roomName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Dagdeel</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${capitalize(formatWeekdayDagdeel(subscription))}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Bedrag per ${config.periodWeeks} weken</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${formatPrice(subscription.price_cents)}</td>
          </tr>
        </table>

        <p>De eerste ${config.periodWeeks} weken zijn betaald. Daarna ontvangen jullie per
        ${config.periodWeeks} weken een apart betaalverzoek per e-mail - er wordt niets
        automatisch afgeschreven. Betaal je een keer niet op tijd, dan houden we het
        tijdslot nog ${config.subscriptionGraceDays} dagen coulant vast voordat het vrijkomt
        voor een andere band.</p>

        <p>Let op: de eenmalige borg voor de sleutel wordt apart geregeld, zie
        <a href="mailto:${config.organizationEmail}">${config.organizationEmail}</a>.</p>

        <p>Wil je de vaste reservering stopzetten? Klik dan op onderstaande link:</p>
        <p><a href="${cancelUrl}">Vaste reservering opzeggen</a></p>

        <p>Met vriendelijke groet,<br>${config.organizationName}</p>
      </div>
    `,
  });
}

export async function sendSubscriptionNotificationToOrg(subscription: Subscription) {
  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: await getOrgRecipients(),
    subject: `Nieuwe vaste reservering: ${subscription.band_name} - ${formatWeekdayDagdeel(subscription)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Nieuwe vaste reservering</h2>
        <p>Er is een nieuwe vaste reservering bevestigd en de eerste betaling is gelukt:</p>

        <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Band</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${subscription.band_name}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Contact</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${subscription.contact_name} (${subscription.contact_email})</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Telefoon</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${subscription.contact_phone || "-"}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Dagdeel</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${capitalize(formatWeekdayDagdeel(subscription))}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Bedrag per ${config.periodWeeks} weken</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${formatPrice(subscription.price_cents)}</td>
          </tr>
        </table>

        <p>Denk aan de sleuteloverdracht en borg (buiten dit systeem om, zie BESTUUR.md).</p>
      </div>
    `,
  });
}

export async function sendMembershipRequestNotificationToOrg(
  request: MembershipRequest
) {
  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: await getOrgRecipients(),
    subject: `Nieuw lidmaatschapsverzoek: ${request.band_name}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Nieuw lidmaatschapsverzoek</h2>
        <p>Een band die nog geen lid is, wil kunnen boeken:</p>

        <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Band</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${request.band_name}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Contact</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${request.contact_name} (${request.contact_email})</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Telefoon</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${request.contact_phone || "-"}</td>
          </tr>
        </table>

        <p>Beoordeel dit verzoek in het beheerpaneel onder "Aanvragen".</p>
      </div>
    `,
  });
}

export async function sendMyBookingsLinkEmail(email: string, link: string) {
  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: email,
    subject: `Jouw boekingen bij ${config.roomName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Jouw boekingen</h2>
        <p>Klik op onderstaande link om je boekingen en vaste reservering te bekijken en te beheren.
        Deze link is 30 minuten geldig.</p>
        <p><a href="${link}">Bekijk mijn boekingen</a></p>
        <p>Met vriendelijke groet,<br>${config.organizationName}</p>
      </div>
    `,
  });
}

export async function sendAdminPasswordResetEmail(email: string, link: string) {
  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: email,
    subject: `Wachtwoord instellen voor het beheerpaneel`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Wachtwoord instellen</h2>
        <p>Klik op onderstaande link om een (nieuw) wachtwoord in te stellen voor het
        beheerpaneel van ${config.roomName}. Deze link is 30 minuten geldig.</p>
        <p><a href="${link}">Wachtwoord instellen</a></p>
        <p>Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.</p>
        <p>Met vriendelijke groet,<br>${config.organizationName}</p>
      </div>
    `,
  });
}

function payPeriodUrl(periodPayment: SubscriptionPayment): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  return `${appUrl}/vaste-reservering/betalen?token=${periodPayment.pay_token}`;
}

export async function sendPeriodPaymentConfirmationEmail(
  subscription: Subscription,
  periodPayment: SubscriptionPayment,
  extraRecipients: string[] = []
) {
  const recipients = Array.from(new Set([subscription.contact_email, ...extraRecipients]));

  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: recipients,
    subject: `Betaald — ${formatWeekdayDagdeel(subscription)}, ${formatPeriod(periodPayment)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Betaling ontvangen</h2>
        <p>Hoi ${subscription.contact_name},</p>
        <p>De periode ${formatPeriod(periodPayment)} van <strong>${subscription.band_name}</strong>
        is betaald (${formatPrice(periodPayment.amount_cents)}). ${capitalize(formatWeekdayDagdeel(subscription))}
        is in die periode van jullie.</p>
        <p>Het volgende betaalverzoek krijgen jullie automatisch per e-mail, ruim voordat de
        nieuwe periode begint.</p>
        <p>Met vriendelijke groet,<br>${config.organizationName}</p>
      </div>
    `,
  });
}

export async function sendPeriodPaymentRequestEmail(
  subscription: Subscription,
  periodPayment: SubscriptionPayment,
  extraRecipients: string[] = []
) {
  const recipients = Array.from(new Set([subscription.contact_email, ...extraRecipients]));

  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: recipients,
    subject: `Nieuwe periode voor ${subscription.band_name} — betalen kan nu`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Volgende periode klaar om te betalen</h2>
        <p>Hoi ${subscription.contact_name},</p>
        <p>De volgende periode voor <strong>${subscription.band_name}</strong>
        (${formatPeriod(periodPayment)}, ${formatWeekdayDagdeel(subscription)}) staat klaar.
        Reken je ${formatPrice(periodPayment.amount_cents)} af vóór
        <strong>${formatDate(periodPayment.due_date)}</strong>, dan blijft het tijdslot gewoon van jullie.</p>
        <p><a href="${payPeriodUrl(periodPayment)}" style="display:inline-block;padding:10px 20px;background:#175670;color:#fff;border-radius:6px;text-decoration:none;">Periode betalen — ${formatPrice(periodPayment.amount_cents)}</a></p>
        <p>Even niet doorgaan of lukt het niet? Laat het weten, dan zoeken we samen een oplossing.</p>
        <p>Met vriendelijke groet,<br>${config.organizationName}</p>
      </div>
    `,
  });
}

export async function sendPeriodReminderEmail(
  subscription: Subscription,
  periodPayment: SubscriptionPayment,
  extraRecipients: string[] = []
) {
  const recipients = Array.from(new Set([subscription.contact_email, ...extraRecipients]));

  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: recipients,
    subject: `Herinnering: periode ${subscription.band_name} nog niet betaald`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Even een herinnering</h2>
        <p>Hoi ${subscription.contact_name},</p>
        <p>We zagen de betaling voor de periode ${formatPeriod(periodPayment)}
        (${formatWeekdayDagdeel(subscription)}) nog niet binnenkomen. Geen paniek - betaal je
        vóór <strong>${formatDate(periodPayment.grace_until)}</strong>, dan blijft het tijdslot gewoon van jullie.</p>
        <p><a href="${payPeriodUrl(periodPayment)}" style="display:inline-block;padding:10px 20px;background:#175670;color:#fff;border-radius:6px;text-decoration:none;">Periode betalen — ${formatPrice(periodPayment.amount_cents)}</a></p>
        <p>Met vriendelijke groet,<br>${config.organizationName}</p>
      </div>
    `,
  });
}

export async function sendPeriodGraceWarningEmail(
  subscription: Subscription,
  periodPayment: SubscriptionPayment,
  extraRecipients: string[] = []
) {
  const recipients = Array.from(new Set([subscription.contact_email, ...extraRecipients]));

  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: recipients,
    subject: `Nog even: ${formatWeekdayDagdeel(subscription)} staat tot ${formatDate(periodPayment.grace_until)} voor jullie klaar`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Laatste kans om het tijdslot te behouden</h2>
        <p>Hoi ${subscription.contact_name},</p>
        <p>We hebben de betaling voor ${subscription.band_name} (${formatPeriod(periodPayment)})
        nog steeds niet ontvangen. We houden <strong>${formatWeekdayDagdeel(subscription)}</strong> nog vast
        <strong>tot en met ${formatDate(periodPayment.grace_until)}</strong>. Daarna geven we het tijdslot vrij
        aan een andere band, en is het dit jaar niet meer opnieuw te claimen.</p>
        <p><a href="${payPeriodUrl(periodPayment)}" style="display:inline-block;padding:10px 20px;background:#175670;color:#fff;border-radius:6px;text-decoration:none;">Periode betalen — ${formatPrice(periodPayment.amount_cents)}</a></p>
        <p>Lukt het niet of stopt de band ermee? Mail even naar
        <a href="mailto:${config.organizationEmail}">${config.organizationEmail}</a>, dan zoeken we een oplossing.</p>
        <p>Met vriendelijke groet,<br>${config.organizationName}</p>
      </div>
    `,
  });
}

export async function sendPeriodLapsedEmail(
  subscription: Subscription,
  extraRecipients: string[] = []
) {
  const recipients = Array.from(new Set([subscription.contact_email, ...extraRecipients]));

  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: recipients,
    subject: `${formatWeekdayDagdeel(subscription)} is vrijgegeven`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Tijdslot vrijgegeven</h2>
        <p>Hoi ${subscription.contact_name},</p>
        <p>We hebben geen betaling ontvangen voor ${subscription.band_name}, dus
        <strong>${formatWeekdayDagdeel(subscription)}</strong> staat weer open voor andere bands.</p>
        <p>Jullie zijn niets kwijt: losse dagdelen boeken kan gewoon, en komt er weer een vast
        tijdslot vrij, dan kunnen jullie het opnieuw aanvragen.</p>
        <p>Zit er iets anders achter? Laat het ons weten via
        <a href="mailto:${config.organizationEmail}">${config.organizationEmail}</a>.</p>
        <p>Met vriendelijke groet,<br>${config.organizationName}</p>
      </div>
    `,
  });
}

export async function sendPeriodLapsedNotificationToOrg(subscription: Subscription) {
  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: await getOrgRecipients(),
    subject: `Vaste reservering vervallen (niet betaald): ${subscription.band_name}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Vaste reservering vervallen wegens niet-betalen</h2>
        <p><strong>${subscription.band_name}</strong> (${subscription.contact_name},
        ${subscription.contact_email}) heeft de periode niet op tijd betaald. Hun dagdeel
        (${formatWeekdayDagdeel(subscription)}) is vrijgegeven en weer beschikbaar.</p>
        <p>De eenmalige borg blijft ongewijzigd staan (hoort bij het lidmaatschap, niet bij dit
        tijdslot) - alleen relevant als deze band de vereniging helemaal verlaat.</p>
      </div>
    `,
  });
}

export async function sendSwapConfirmationEmail(
  subscription: Subscription,
  originalDate: string,
  newDate: string,
  newDagdeelId: string,
  extraRecipients: string[] = []
) {
  const recipients = Array.from(new Set([subscription.contact_email, ...extraRecipients]));

  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: recipients,
    subject: `Repetitie verplaatst: ${subscription.band_name}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Repetitie verplaatst</h2>
        <p>Hoi ${subscription.contact_name},</p>
        <p>Jullie repetitie op <strong>${formatDate(originalDate)}</strong> is verplaatst naar
        <strong>${formatDate(newDate)} (${dagdeelLabel(newDagdeelId)})</strong>. Jullie vaste
        ${formatWeekdayDagdeel(subscription)} blijft verder gewoon van jullie.</p>
        <p>Met vriendelijke groet,<br>${config.organizationName}</p>
      </div>
    `,
  });
}

export async function sendSwapNotificationToOrg(
  subscription: Subscription,
  originalDate: string,
  newDate: string,
  newDagdeelId: string
) {
  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: await getOrgRecipients(),
    subject: `Repetitie verplaatst: ${subscription.band_name}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Repetitie verplaatst</h2>
        <p><strong>${subscription.band_name}</strong> heeft de repetitie van
        ${formatDate(originalDate)} verplaatst naar
        ${formatDate(newDate)} (${dagdeelLabel(newDagdeelId)}).</p>
      </div>
    `,
  });
}

export async function sendSubscriptionCancellationNotification(subscription: Subscription) {
  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: await getOrgRecipients(),
    subject: `Vaste reservering opgezegd: ${subscription.band_name} - ${formatWeekdayDagdeel(subscription)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Vaste reservering opgezegd</h2>
        <p>De volgende vaste reservering is opgezegd. Er worden geen betaalverzoeken meer verstuurd.</p>

        <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Band</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${subscription.band_name}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Contact</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${subscription.contact_name} (${subscription.contact_email})</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Dagdeel</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${capitalize(formatWeekdayDagdeel(subscription))}</td>
          </tr>
        </table>

        <p>Denk aan het terugkrijgen van de sleutel en het verrekenen van de borg (buiten dit systeem om).</p>
      </div>
    `,
  });
}

export async function sendSubscriptionCancelledConfirmationEmail(
  subscription: Subscription,
  activeUntil: string | null,
  extraRecipients: string[] = []
) {
  const recipients = Array.from(new Set([subscription.contact_email, ...extraRecipients]));

  await send({
    from: `${config.organizationName} <${config.senderEmail}>`,
    to: recipients,
    subject: `Opzegging bevestigd: ${formatWeekdayDagdeel(subscription)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Vaste reservering opgezegd</h2>
        <p>Hoi ${subscription.contact_name},</p>
        <p>De vaste reservering van <strong>${subscription.band_name}</strong> (elke
        ${formatWeekdayDagdeel(subscription)}) is opgezegd. Je ontvangt geen betaalverzoeken meer.</p>
        <p>${
          activeUntil
            ? `Wat al betaald is, blijft van jullie: het tijdslot is nog voor jullie tot en met <strong>${formatDate(activeUntil)}</strong>.`
            : "Het tijdslot is per direct weer vrij voor andere bands."
        }</p>
        <p>Losse dagdelen boeken kan natuurlijk altijd. Vergeet niet de sleutel terug te geven;
        de borg regelen we via <a href="mailto:${config.organizationEmail}">${config.organizationEmail}</a>.</p>
        <p>Met vriendelijke groet,<br>${config.organizationName}</p>
      </div>
    `,
  });
}

