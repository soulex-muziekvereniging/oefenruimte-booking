import { Resend } from "resend";
import { config } from "@/config";
import { Booking, Subscription, MembershipRequest, SubscriptionPayment } from "./supabase";

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

const DAY_NAMES_NL = [
  "zondag",
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
];

function formatWeekdayDagdeel(subscription: Subscription): string {
  const dagdeel = config.dagdelen.find((d) => d.id === subscription.dagdeel_id);
  return `${DAY_NAMES_NL[subscription.weekday]} ${dagdeel?.label.toLowerCase() ?? subscription.dagdeel_id}`;
}

function formatFrequency(frequency: Subscription["frequency"]): string {
  return config.subscriptionPricing[frequency].label.toLowerCase();
}

function formatMonth(monthStr: string): string {
  return new Date(monthStr + "T00:00:00").toLocaleDateString("nl-NL", {
    month: "long",
    year: "numeric",
  });
}

export async function sendConfirmationEmail(booking: Booking, extraRecipients: string[] = []) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const cancelUrl = `${appUrl}/booking/cancel?id=${booking.id}&token=${booking.cancel_token}`;
  const recipients = Array.from(
    new Set([booking.contact_email, ...extraRecipients])
  );

  await resend.emails.send({
    from: `${config.organizationName} <onboarding@resend.dev>`,
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
  await resend.emails.send({
    from: `${config.organizationName} <onboarding@resend.dev>`,
    to: config.organizationEmail,
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

export async function sendSubscriptionConfirmationEmail(
  subscription: Subscription,
  extraRecipients: string[] = []
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const cancelUrl = `${appUrl}/subscription/cancel?id=${subscription.id}&token=${subscription.cancel_token}`;
  const recipients = Array.from(
    new Set([subscription.contact_email, ...extraRecipients])
  );

  await resend.emails.send({
    from: `${config.organizationName} <onboarding@resend.dev>`,
    to: recipients,
    subject: `Vaste reservering bevestigd: ${config.roomName} elke ${formatWeekdayDagdeel(subscription)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Vaste reservering bevestigd!</h2>
        <p>Hallo ${subscription.contact_name},</p>
        <p><strong>${formatWeekdayDagdeel(subscription)}</strong> is van <strong>${subscription.band_name}</strong>.
        Zolang jullie elke maand op tijd betalen, blijft dat tijdslot het hele jaar voor
        jullie gereserveerd - we geven het niet aan een andere band.</p>

        <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Ruimte</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${config.roomName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Dagdeel</td>
            <td style="padding: 8px; border: 1px solid #ddd;">Elke ${formatWeekdayDagdeel(subscription)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Frequentie</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${formatFrequency(subscription.frequency)}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Bedrag per maand</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${formatPrice(subscription.price_cents)}</td>
          </tr>
        </table>

        <p>Elke maand ontvangen jullie hiervoor een apart betaalverzoek per e-mail - er wordt
        niets automatisch afgeschreven. Betaal je een keer niet op tijd, dan houden we het
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
  await resend.emails.send({
    from: `${config.organizationName} <onboarding@resend.dev>`,
    to: config.organizationEmail,
    subject: `Nieuwe vaste reservering: ${subscription.band_name} - elke ${formatWeekdayDagdeel(subscription)}`,
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
            <td style="padding: 8px; border: 1px solid #ddd;">Elke ${formatWeekdayDagdeel(subscription)} (${formatFrequency(subscription.frequency)})</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Bedrag per maand</td>
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
  await resend.emails.send({
    from: `${config.organizationName} <onboarding@resend.dev>`,
    to: config.organizationEmail,
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
  await resend.emails.send({
    from: `${config.organizationName} <onboarding@resend.dev>`,
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

  await resend.emails.send({
    from: `${config.organizationName} <onboarding@resend.dev>`,
    to: recipients,
    subject: `Betaald — ${formatWeekdayDagdeel(subscription)} is van jullie in ${formatMonth(periodPayment.period_month)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Betaling ontvangen</h2>
        <p>Hoi ${subscription.contact_name},</p>
        <p>De periode van <strong>${subscription.band_name}</strong> voor ${formatMonth(periodPayment.period_month)}
        is betaald (${formatPrice(periodPayment.amount_cents)}). Elke ${formatWeekdayDagdeel(subscription)}
        is deze maand van jullie.</p>
        <p>De volgende betaalronde krijgen jullie automatisch per e-mail, ruim voordat de
        nieuwe maand begint.</p>
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

  await resend.emails.send({
    from: `${config.organizationName} <onboarding@resend.dev>`,
    to: recipients,
    subject: `Nieuwe periode voor ${subscription.band_name} — betalen kan nu`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Volgende periode klaar om te betalen</h2>
        <p>Hoi ${subscription.contact_name},</p>
        <p>De volgende periode voor <strong>${subscription.band_name}</strong>
        (${formatMonth(periodPayment.period_month)}, elke ${formatWeekdayDagdeel(subscription)}) staat klaar.
        Reken je ${formatPrice(periodPayment.amount_cents)} af vóór
        <strong>${formatDate(periodPayment.due_date)}</strong>, dan blijft het tijdslot gewoon van jullie.</p>
        <p><a href="${payPeriodUrl(periodPayment)}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">Periode betalen — ${formatPrice(periodPayment.amount_cents)}</a></p>
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

  await resend.emails.send({
    from: `${config.organizationName} <onboarding@resend.dev>`,
    to: recipients,
    subject: `Herinnering: periode ${subscription.band_name} nog niet betaald`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Even een herinnering</h2>
        <p>Hoi ${subscription.contact_name},</p>
        <p>We zagen de betaling voor de periode ${formatMonth(periodPayment.period_month)}
        (elke ${formatWeekdayDagdeel(subscription)}) nog niet binnenkomen. Geen paniek - betaal je
        vóór <strong>${formatDate(periodPayment.grace_until)}</strong>, dan blijft het tijdslot gewoon van jullie.</p>
        <p><a href="${payPeriodUrl(periodPayment)}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">Periode betalen — ${formatPrice(periodPayment.amount_cents)}</a></p>
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

  await resend.emails.send({
    from: `${config.organizationName} <onboarding@resend.dev>`,
    to: recipients,
    subject: `Nog even: ${formatWeekdayDagdeel(subscription)} staat tot ${formatDate(periodPayment.grace_until)} voor jullie klaar`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Laatste kans om het tijdslot te behouden</h2>
        <p>Hoi ${subscription.contact_name},</p>
        <p>We hebben de betaling voor ${subscription.band_name} (${formatMonth(periodPayment.period_month)})
        nog steeds niet ontvangen. We houden <strong>${formatWeekdayDagdeel(subscription)}</strong> nog vast
        <strong>tot en met ${formatDate(periodPayment.grace_until)}</strong>. Daarna geven we het tijdslot vrij
        aan een andere band, en is het dit jaar niet meer opnieuw te claimen.</p>
        <p><a href="${payPeriodUrl(periodPayment)}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">Periode betalen — ${formatPrice(periodPayment.amount_cents)}</a></p>
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

  await resend.emails.send({
    from: `${config.organizationName} <onboarding@resend.dev>`,
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
  await resend.emails.send({
    from: `${config.organizationName} <onboarding@resend.dev>`,
    to: config.organizationEmail,
    subject: `Vaste reservering vervallen (niet betaald): ${subscription.band_name}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Vaste reservering vervallen wegens niet-betalen</h2>
        <p><strong>${subscription.band_name}</strong> (${subscription.contact_name},
        ${subscription.contact_email}) heeft de periode niet op tijd betaald. Elke
        ${formatWeekdayDagdeel(subscription)} is vrijgegeven en weer beschikbaar.</p>
        <p>De eenmalige borg blijft ongewijzigd staan (hoort bij het lidmaatschap, niet bij dit
        tijdslot) - alleen relevant als deze band de vereniging helemaal verlaat.</p>
      </div>
    `,
  });
}

export async function sendSubscriptionCancellationNotification(subscription: Subscription) {
  await resend.emails.send({
    from: `${config.organizationName} <onboarding@resend.dev>`,
    to: config.organizationEmail,
    subject: `Vaste reservering opgezegd: ${subscription.band_name} - elke ${formatWeekdayDagdeel(subscription)}`,
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
            <td style="padding: 8px; border: 1px solid #ddd;">Elke ${formatWeekdayDagdeel(subscription)}</td>
          </tr>
        </table>

        <p>Denk aan het terugkrijgen van de sleutel en het verrekenen van de borg (buiten dit systeem om).</p>
      </div>
    `,
  });
}
