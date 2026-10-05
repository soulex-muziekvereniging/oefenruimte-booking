import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "@/config";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/adminSession";

// Handleiding voor beheerders (alleen na inloggen). Screenshots: public/handleiding-beheer,
// gemaakt met verzonnen bands, namen en e-mailadressen.
export const metadata: Metadata = {
  title: "Handleiding beheer | Soulex Oefenruimte",
  robots: { index: false, follow: false },
};

function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={`/handleiding-beheer/${src}`}
      alt={alt}
      width={1100}
      height={860}
      sizes="(min-width: 768px) 720px, 100vw"
      className="w-full h-auto rounded-xl border border-gray-200 shadow-sm"
    />
  );
}

function Section({
  id,
  title,
  children,
  shot,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  shot?: { src: string; alt: string };
}) {
  return (
    <section id={id} className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-7 scroll-mt-28">
      <h2 className="text-xl sm:text-2xl font-bold text-blue-900 font-[family-name:var(--font-slab)] mb-3">
        {title}
      </h2>
      <div className="space-y-3 text-gray-800 leading-relaxed">{children}</div>
      {shot && (
        <div className="mt-5">
          <Shot {...shot} />
        </div>
      )}
    </section>
  );
}

const toc = [
  ["inloggen", "Inloggen en beheerders"],
  ["boekingen", "Boekingen (weekplanning)"],
  ["venster", "Een repetitie aanpassen"],
  ["toevoegen", "Zelf iets inplannen"],
  ["leden", "Leden"],
  ["aanvragen", "Aanvragen (nieuwe leden)"],
  ["abonnementen", "Abonnementen (vaste plekken)"],
  ["betalingen", "Betalingen"],
  ["zalenplanner", "Zalenplanner De Borgh"],
  ["instellingen", "Instellingen"],
  ["automatisch", "Wat gaat vanzelf?"],
  ["situaties", "Veelvoorkomende situaties"],
];

export default async function BeheerHandleidingPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !verifySessionToken(token)) redirect("/admin/login");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12 space-y-5">
      <div>
        <Link href="/admin" className="text-sm text-blue-700 hover:underline">
          ← Terug naar het beheer
        </Link>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-blue-900 font-[family-name:var(--font-slab)]">
          Handleiding beheer
        </h1>
        <p className="mt-2 text-gray-600">
          Alles wat je als beheerder van de oefenruimte op deze site kunt doen, per tabblad. De
          screenshots gebruiken verzonnen bands en namen.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
        <strong>Concept.</strong> Na de bestuursvergadering kan het betaalmodel (vooraf of achteraf)
        veranderen; dan worden de onderdelen Betalingen en &quot;Wat gaat vanzelf?&quot; bijgewerkt.
      </div>

      <nav aria-label="Inhoud" className="bg-white rounded-2xl border border-gray-200 p-5">
        <p className="font-semibold text-blue-900 mb-2">Inhoud</p>
        <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm list-decimal pl-5">
          {toc.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-blue-700 hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="inloggen" title="Inloggen en beheerders">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            Je logt in op <strong>/admin</strong> met je eigen e-mailadres en wachtwoord. Je blijft
            een tijd ingelogd; met <em>Uitloggen</em> (rechtsboven) log je uit.
          </li>
          <li>
            Nieuwe beheerder? Voeg die toe onder <em>Instellingen → Beheerders</em>. Die kiest zelf
            een wachtwoord via <em>Wachtwoord vergeten of nog niet ingesteld?</em> op de inlogpagina.
          </li>
          <li>Deze handleiding vind je altijd via de link rechtsboven in het beheer.</li>
        </ul>
      </Section>

      <Section
        id="boekingen"
        title="Boekingen (weekplanning)"
        shot={{ src: "a01-boekingen.png", alt: "De weekplanning in het beheer" }}
      >
        <p>
          De eerste tab is de weekplanning van de oefenruimte. Met <em>Vorige week</em> en{" "}
          <em>Volgende week</em> blader je.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <span className="text-green-800 font-medium">Groen</span>: losse boeking, betaald.{" "}
            <span className="text-yellow-700 font-medium">Geel</span>: losse boeking die nog op
            betaling wacht (vervalt na 15 minuten als er niet betaald wordt).
          </li>
          <li>
            <span className="text-blue-800 font-medium">Blauw</span>: vaste reservering.
            &quot;(geruild)&quot; betekent dat de band deze keer hierheen verzet heeft.
          </li>
          <li>Gestippeld met doorgestreepte naam: deze keer vrijgegeven, de band komt niet.</li>
          <li>Grijs: vrij.</li>
        </ul>
      </Section>

      <Section
        id="venster"
        title="Een repetitie aanpassen"
        shot={{ src: "a02-venster.png", alt: "Het venster bij een vaste repetitie" }}
      >
        <p>Tik op een blok. Je ziet de contactpersoon en de andere bandleden, en wat je kunt doen:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Bellen</strong> of <strong>WhatsApp</strong> (met een kant-en-klaar bericht, in
            te stellen onder Instellingen).
          </li>
          <li>
            Bij een vaste repetitie: <strong>Deze keer verplaatsen</strong> (vrij moment kiezen en
            bevestigen) of <strong>Deze keer vrijgeven</strong> (de band komt niet, het dagdeel komt
            vrij). Voor het beheer gelden de limieten van de band niet. De band krijgt een mail.
          </li>
          <li>
            Bij een verzette of vrijgegeven keer: <strong>terugdraaien</strong>, terug naar het
            oorspronkelijke moment (kan alleen als dat nog vrij is).
          </li>
          <li>
            Bij een losse boeking: <strong>Boeking annuleren</strong>. Online betaald? Dan stort
            Mollie het bedrag automatisch terug.
          </li>
        </ul>
      </Section>

      <Section
        id="toevoegen"
        title="Zelf iets inplannen"
        shot={{ src: "a03-toevoegen.png", alt: "Het formulier om zelf een boeking toe te voegen" }}
      >
        <p>
          Met <strong>+ Toevoegen</strong> zet je er zelf een boeking in, zonder online betaling:
          bijvoorbeeld een afspraak, contante betaling of het overzetten van een bestaande band.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Kies <em>eenmalig</em>, <em>elke week</em> of <em>om de week</em>, de datum en het dagdeel.</li>
          <li>Bij een vaste reservering kun je meteen een opslagruimte toewijzen.</li>
          <li>De band krijgt een bevestiging per mail.</li>
        </ul>
      </Section>

      <Section id="leden" title="Leden" shot={{ src: "a04-leden.png", alt: "De ledenlijst" }}>
        <p>
          Dit is de lijst van <strong>wie de oefenruimte mag boeken</strong>, niet de
          ledenadministratie van de hele vereniging. Alleen e-mailadressen op deze lijst kunnen
          boeken en Mijn boekingen gebruiken. Per band zie je de bandleden met hun telefoonnummer.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Lid zonder band</strong> (solo, duo, les) dat de ruimte wil gebruiken: voeg
            diegene toe met de eigen naam als bandnaam.
          </li>
          <li>
            <strong>Exporteren</strong> geeft de lijst als Excel-bestand (CSV: Bandnaam, E-mailadres,
            Telefoon, Actief). <strong>Importeren</strong> leest zo&apos;n bestand weer in: je ziet eerst
            een voorbeeld (toevoegen, bijwerken, overslaan, fouten) en pas na <em>Bevestigen</em>
            wordt het opgeslagen. Een import verwijdert nooit iemand en verplaatst niemand naar een
            andere band; nieuwe leden hebben een geldig telefoonnummer nodig. Sla in Excel op als
            &quot;CSV&quot;.
          </li>
          <li>
            <strong>Nieuwe band</strong>: bandnaam, e-mailadres en telefoonnummer (verplicht) en{" "}
            <em>Band toevoegen</em>.
          </li>
          <li>
            <strong>Extra bandlid</strong>: in het vak onder de band. Dezelfde bandnaam = dezelfde
            band; alle bandleden zien dan hetzelfde en krijgen dezelfde mails.
          </li>
          <li>
            Telefoonnummer aanpassen met <em>wijzig</em>, iemand tijdelijk uitzetten met{" "}
            <em>Actief lid</em>, of verwijderen.
          </li>
        </ul>
      </Section>

      <Section id="aanvragen" title="Aanvragen (nieuwe leden)" shot={{ src: "a07-aanvragen.png", alt: "Lidmaatschapsverzoeken" }}>
        <p>
          Bands die nog geen lid zijn, vragen toegang aan via de site. Je krijgt daar een melding
          van, en bij de tab staat een rood getal.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            Eerst buiten de site: <strong>contract getekend en borg betaald?</strong> Bij{" "}
            <em>Toevoegen als lid</em> vraagt de site dat nog een keer na.
          </li>
          <li>Na toevoegen staat de band in de ledenlijst en kan hij boeken. Of wijs het verzoek af.</li>
        </ul>
      </Section>

      <Section
        id="abonnementen"
        title="Abonnementen (vaste plekken)"
        shot={{ src: "a05-abonnementen.png", alt: "Overzicht van de vaste reserveringen" }}
      >
        <p>Alle vaste reserveringen, met per band het ritme, de contactpersoon en de betaalstatus.</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Huidige periode</strong>: betaald, of open met de uiterste betaaldatum. Bij een
            open periode kun je <strong>uitstel geven</strong> (knop <em>Coulance +14d</em>) of{" "}
            <strong>kwijtschelden</strong> (deze periode hoeft niet betaald te worden, de plek blijft).
          </li>
          <li><strong>Opslagruimte</strong> toewijzen of wijzigen; de prijs past zich aan vanaf het volgende betaalverzoek.</li>
          <li><strong>Verplaatste repetities</strong> zien en terugdraaien.</li>
          <li>
            <strong>Zeg op</strong>: de vaste reservering stopt; wat al betaald is, loopt door tot het
            einde van die periode. Bands kunnen ook zelf opzeggen via hun bevestigingsmail.
          </li>
          <li>
            <em>Toon opgezegde/vervallen</em> laat ook gestopte reserveringen zien; die kun je daar
            eventueel definitief verwijderen.
          </li>
        </ul>
      </Section>

      <Section id="betalingen" title="Betalingen" shot={{ src: "a06-betalingen.png", alt: "Het betalingsoverzicht" }}>
        <p>
          Alle betalingen per <strong>boekjaar</strong>: betaalperiodes van vaste reserveringen en
          online betaalde losse boekingen, met band, bedrag, status en wie er betaald heeft.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Download (Excel)</strong> voor de jaarafrekening of de kascommissie. Bij een nieuw
            boekjaar begint het overzicht leeg; oudere jaren blijven op te vragen.
          </li>
          <li>
            Filter <strong>Af te handelen</strong>: wat nog openstaat. Daar kun je:
            <ul className="list-[circle] pl-5 mt-1 space-y-1">
              <li>
                <strong>Handmatig betaald</strong>: contant of per overboeking betaald. Vul in hoe; de
                band krijgt de gewone bevestiging.
              </li>
              <li><strong>Kwijtschelden</strong> met een reden (komt in het overzicht en de export).</li>
            </ul>
          </li>
          <li>
            <strong>Vervallen</strong>: niet betaald, maar de vaste reservering is inmiddels gestopt.
            Telt niet als &quot;open&quot;, blijft zichtbaar tot je hem afhandelt.
          </li>
        </ul>
      </Section>

      <Section
        id="zalenplanner"
        title="Zalenplanner De Borgh"
        shot={{ src: "a08-zalenplanner.png", alt: "De werklijst voor de zalenplanner van De Borgh" }}
      >
        <p>
          De Borgh wil weten wanneer er iemand in de ruimte is (niet wie). Deze tab is de werklijst
          voor hun zalenplanner.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Toevoegen</strong>: <em>Invullen bij De Borgh</em> opent hun formulier met datum
            en tijd al ingevuld (eerste keer inloggen met <em>Onthoud mij</em>). Naam: Soulex
            Oefenruimte. Daarna <em>Verwerkt</em>.
          </li>
          <li>
            <strong>Doorgeven</strong>: verwijderen kan alleen De Borgh. De mailknop maakt een
            kant-en-klare mail, of zet <em>automatisch mailen</em> aan: gaat het om vandaag, dan
            meteen; anders de volgende ochtend in één mail. De tekst van die mail stel je hier ook in.
          </li>
          <li>De eerste keer, als hun planner al klopt: <em>Alles als verwerkt markeren</em>.</li>
        </ul>
      </Section>

      <Section id="instellingen" title="Instellingen" shot={{ src: "a09-instellingen.png", alt: "De instellingen" }}>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Tarieven</strong>: gelden meteen voor nieuwe boekingen; vink aan om ze ook bij
            lopende vaste reserveringen toe te passen (vanaf het volgende betaalverzoek). Alle
            beheerders krijgen een mail bij een wijziging.
          </li>
          <li><strong>Vervaltermijn</strong>: hoeveel dagen na de vervaldatum een onbetaalde vaste plek vervalt.</li>
          <li><strong>Boekjaar</strong>: in welke maand het boekjaar begint.</li>
          <li><strong>WhatsApp-berichten</strong>: de tekst die klaarstaat bij de WhatsApp-knoppen.</li>
          <li><strong>Meldingen</strong>: wie de mails voor het bestuur krijgt (nieuwe boekingen, opzeggingen, aanvragen).</li>
          <li><strong>Beheerders</strong>: wie er mag inloggen op het beheer.</li>
        </ul>
      </Section>

      <Section id="automatisch" title="Wat gaat vanzelf?">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Betaalverzoeken</strong> voor vaste plekken gaan 10 dagen voor elke nieuwe periode
            van {config.periodWeeks} weken naar alle bandleden. Niet betaald? Een herinnering na 7
            dagen, een waarschuwing 3 dagen voor het einde van de vervaltermijn, en daarna vervalt de
            vaste plek en komt het dagdeel vrij.
          </li>
          <li>
            <strong>Mails</strong>: alle bandleden krijgen een bericht bij elke wijziging in hun
            planning en bij alles rond betalen. De ontvangers onder Meldingen krijgen de berichten
            voor het bestuur.
          </li>
          <li><strong>Afgebroken betalingen</strong> vervallen na 15 minuten; het dagdeel komt weer vrij.</li>
          <li><strong>De Borgh</strong>: als automatisch mailen aan staat, zie Zalenplanner.</li>
        </ul>
      </Section>

      <Section id="situaties" title="Veelvoorkomende situaties">
        <dl className="space-y-3">
          {[
            ["Een band belt: we kunnen dinsdag niet.", "Boekingen → tik op het blok → Deze keer verplaatsen of Deze keer vrijgeven."],
            ["Een band heeft contant of per bank betaald.", "Betalingen → Af te handelen → Handmatig betaald."],
            ["Een band kan even niet betalen (ziekte, pauze).", "Abonnementen → Coulance +14d (uitstel), of Kwijtschelden."],
            ["Een band wil stoppen.", "Abonnementen → Zeg op (of de band doet het zelf via de link in de mail)."],
            ["Iemand krijgt geen mails of kan niet inloggen bij Mijn boekingen.", "Controleer onder Leden of het e-mailadres goed op de lijst staat (en actief is), en laat in de spam kijken."],
            ["Terugstorten via Mollie lukt niet automatisch.", "Annuleer toch (de site vraagt dat) en stort zelf terug via het Mollie-dashboard."],
            ["Een nieuwe band wil beginnen.", "Contract en borg regelen → Aanvragen → Toevoegen als lid (of zelf toevoegen onder Leden)."],
          ].map(([q, a]) => (
            <div key={q}>
              <dt className="font-semibold text-gray-900">{q}</dt>
              <dd className="text-gray-700">{a}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-gray-500">
          Vragen over de techniek? Zie BESTUUR.md in de code, of mail {config.organizationEmail}.
        </p>
      </Section>
    </div>
  );
}
