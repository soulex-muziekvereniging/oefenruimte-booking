import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { config } from "@/config";

// Handleiding voor bandleden. CONCEPT: het onderdeel "Betalen" volgt na de
// bestuursvergadering (vooraf of achteraf betalen). Tot die tijd niet gelinkt en niet
// vindbaar voor zoekmachines. Screenshots: public/handleiding (telefoonformaat, met een
// verzonnen voorbeeldband).
export const metadata: Metadata = {
  title: "Handleiding | Soulex Oefenruimte",
  robots: { index: false, follow: false },
};

const dagdeelText = config.dagdelen
  .map((d) => `${d.label.toLowerCase()} ${d.startHour}:00-${d.startHour + config.slotDurationMinutes / 60}:00`)
  .join(", ");

function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={`/handleiding/${src}`}
      alt={alt}
      width={390}
      height={844}
      sizes="(min-width: 768px) 240px, 80vw"
      className="w-full max-w-[260px] h-auto mx-auto rounded-xl border border-gray-200 shadow-sm"
    />
  );
}

function Section({
  id,
  title,
  children,
  shots,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  shots?: { src: string; alt: string }[];
}) {
  return (
    <section id={id} className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-7 scroll-mt-28">
      <h2 className="text-xl sm:text-2xl font-bold text-blue-900 font-[family-name:var(--font-slab)] mb-3">
        {title}
      </h2>
      <div className={shots?.length ? "grid md:grid-cols-[1fr_260px] gap-6 items-start" : ""}>
        <div className="space-y-3 text-gray-800 leading-relaxed">{children}</div>
        {shots?.length ? (
          <div className="space-y-4">
            {shots.map((s) => (
              <Shot key={s.src} {...s} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

const toc = [
  ["kort", "In het kort"],
  ["los", "Een keer boeken"],
  ["vast", "Een vaste plek"],
  ["mijn", "Mijn boekingen"],
  ["verplaatsen", "Kan het een keer niet?"],
  ["bandleden", "Bandleden toevoegen"],
  ["betalen", "Betalen"],
  ["sleutel", "Sleutel, borg en opslag"],
  ["vragen", "Vragen"],
];

export default function HandleidingPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12 space-y-5">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold text-ink font-[family-name:var(--font-slab)]">
          Handleiding voor bands
        </h1>
        <p className="mt-2 text-ink-muted">
          Zo boek en beheer je de oefenruimte van {config.organizationName} via deze site.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
        <strong>Concept.</strong> Het onderdeel Betalen volgt na de bestuursvergadering. De rest
        klopt al met hoe de site nu werkt.
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

      <Section id="kort" title="In het kort" shots={[{ src: "01-start.png", alt: "De startpagina van de site" }]}>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            De oefenruimte is in gemeenschapshuis De Borgh in Budel en is alleen voor leden van{" "}
            {config.organizationName}.
          </li>
          <li>Je boekt per dagdeel van 4 uur: {dagdeelText}.</li>
          <li>
            Kies voor <strong>een keer</strong> (los) of voor een <strong>vaste plek</strong>: elke
            week of om de week hetzelfde dagdeel.
          </li>
          <li>
            Alles regel je zelf op deze site: boeken, je planning bekijken, een keer verplaatsen en
            bandleden toevoegen. Je hebt geen account of wachtwoord nodig.
          </li>
          <li>
            Alle bandleden die bij jullie band zijn aangemeld, krijgen een mail bij elke wijziging in
            de planning (boeken, verzetten, annuleren) en bij alles rond betalen.
          </li>
          <li>De actuele prijzen staan altijd op de startpagina.</li>
        </ul>
      </Section>

      <Section
        id="los"
        title="Een keer boeken"
        shots={[
          { src: "03-rooster.png", alt: "Het weekrooster met vrije en bezette dagdelen" },
          { src: "04-formulier.png", alt: "Het boekingsformulier" },
        ]}
      >
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>
            Kies op de startpagina bij <em>Een keer</em> op <strong>Datum kiezen</strong>.
          </li>
          <li>
            Je ziet de week. <span className="text-green-800">Groen</span> is vrij,{" "}
            <span className="text-red-700">rood</span> is bezet. Met de pijltjes of &quot;Ga naar
            datum&quot; blader je verder (tot {config.maxWeeksAhead} weken vooruit).
          </li>
          <li>Tik op een vrij dagdeel. Onderin verschijnt het formulier.</li>
          <li>
            Vul bandnaam, je naam en je e-mailadres in (het adres waarmee je bij de vereniging bekend
            bent) en tik op <strong>Betalen en boeken</strong>.
          </li>
          <li>Je betaalt met iDEAL. Daarna krijg je een bevestiging per e-mail.</li>
        </ol>
        <p>
          <strong>Annuleren</strong> kan tot {config.cancellationCutoffHours} uur van tevoren via
          de link in je bevestigingsmail; je krijgt je geld dan terug.
        </p>
      </Section>

      <Section
        id="vast"
        title="Een vaste plek"
        shots={[
          { src: "02-keuze.png", alt: "De keuze tussen een vaste plek en een keer" },
          { src: "05-vaste-plek.png", alt: "Het formulier voor een vaste plek" },
        ]}
      >
        <p>
          Met een vaste plek is hetzelfde dagdeel <strong>elke week</strong> of{" "}
          <strong>om de week</strong> van jullie, het hele jaar door. Per keer ben je dan goedkoper
          uit dan los.
        </p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>
            Kies op de startpagina bij <em>Vaste plek</em> voor om de week of elke week en tik op{" "}
            <strong>Dagdeel kiezen</strong>.
          </li>
          <li>
            Kies de datum van de eerste keer en het dagdeel. De site laat meteen zien of dat
            dagdeel vrij is.
          </li>
          <li>Wil je een opslagruimte erbij? Vink die dan aan (zolang er een vrij is).</li>
          <li>Vul je gegevens in en rond de aanvraag af.</li>
        </ol>
        <p>
          Hoe en wanneer jullie voor een vaste plek betalen, lees je onder{" "}
          <a href="#betalen" className="text-blue-700 underline">
            Betalen
          </a>
          .
        </p>
      </Section>

      <Section
        id="mijn"
        title="Mijn boekingen"
        shots={[
          { src: "06-mijn-boekingen.png", alt: "Inloggen bij Mijn boekingen met je e-mailadres" },
          { src: "07-overzicht.png", alt: "De kalender met de planning van de band" },
        ]}
      >
        <p>
          Via de knop <strong>Mijn boekingen</strong> rechtsboven zie je alles van jullie band.
        </p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Vul je e-mailadres in en tik op <strong>Stuur mij een link</strong>.</li>
          <li>
            Je krijgt een mail met een link. Die werkt een half uur; daarna vraag je gewoon een
            nieuwe aan.
          </li>
        </ol>
        <p>Je ziet daar:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            Een <strong>kalender</strong> met jullie repetities, een jaar vooruit. Gestippelde
            repetities zijn nog niet betaald: die staan onder voorbehoud van betaling.
          </li>
          <li>Je losse boekingen en je vaste plek, en welke bandleden er al betaald hebben.</li>
          <li>Wie er bij jullie band staan ingeschreven.</li>
        </ul>
        <p>Alle bandleden zien hetzelfde overzicht.</p>
      </Section>

      <Section
        id="verplaatsen"
        title="Kan het een keer niet?"
        shots={[
          { src: "08-repetities.png", alt: "De lijst met komende repetities" },
          { src: "09-verplaatsen.png", alt: "Een ander moment kiezen en bevestigen" },
        ]}
      >
        <p>Heb je een vaste plek, dan kun je een repetitie zelf verzetten:</p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>
            Ga naar Mijn boekingen en tik bij de repetitie op <strong>Verzetten</strong>.
          </li>
          <li>Kies een ander vrij moment. Het gekozen moment wordt gemarkeerd.</li>
          <li>
            Controleer de regel eronder (&quot;… wordt …&quot;) en tik op{" "}
            <strong>Bevestigen</strong>. Je krijgt een mail.
          </li>
        </ol>
        <p>
          Dat kan tot {config.subscriptionSwapMaxDaysLater} dagen later,{" "}
          {config.subscriptionMaxSwapsPerPeriod} keer per {config.periodWeeks} weken en tot{" "}
          {config.cancellationCutoffHours} uur van tevoren. Elk bandlid mag dat doen.
        </p>
        <p>
          Lukt het zo niet, bijvoorbeeld als jullie helemaal niet kunnen? Mail dan naar{" "}
          <a href={`mailto:${config.organizationEmail}`} className="text-blue-700 underline">
            {config.organizationEmail}
          </a>
          ; het bestuur kan een repetitie ook verzetten of vrijgeven.
        </p>
      </Section>

      <Section
        id="bandleden"
        title="Bandleden toevoegen"
        shots={[{ src: "10-bandleden.png", alt: "Een bandlid toevoegen" }]}
      >
        <p>
          Onderaan Mijn boekingen voeg je bandleden toe met hun e-mailadres en telefoonnummer
          (allebei verplicht). Wie op de lijst staat, kan namens de band boeken, verzetten en
          betalen.
        </p>
        <p>
          <strong>Iedereen op de lijst krijgt een mail</strong> bij elke wijziging in de planning en
          bij alles rond betalen: boekingen, verzette of vervallen repetities, annuleringen,
          betaalverzoeken, herinneringen en betaalbevestigingen. Zo weet de hele band waar ze aan
          toe is.
        </p>
      </Section>

      <Section id="betalen" title="Betalen">
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
          <strong>Volgt na de bestuursvergadering.</strong> Hier komt te staan hoe en wanneer jullie
          betalen voor een vaste plek, wat er gebeurt als je een keer niet komt en wanneer een vaste
          plek vervalt als er niet betaald wordt.
        </div>
        <p>
          Wat al vaststaat: een losse boeking betaal je meteen bij het boeken met iDEAL, en elke
          betaling wordt per e-mail bevestigd aan alle bandleden, met wie er betaald heeft.
        </p>
        <p>
          <strong>Er kan maar één keer betaald worden.</strong> Een betaalverzoek gaat naar alle
          bandleden, maar zodra één van jullie betaald heeft, staat er &quot;al betaald&quot; als
          een ander op de knop drukt. Niemand hoeft dus bang te zijn dat er dubbel betaald wordt.
          In Mijn boekingen zie je ook wie er betaald heeft.
        </p>
      </Section>

      <Section id="sleutel" title="Sleutel, borg en opslag">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            Nieuwe bands tekenen eenmalig een contract en betalen borg. Dat regel je met het
            bestuur.
          </li>
          <li>
            Bands met een vaste plek hebben een eigen sleutel. Boek je los, of ben je er voor het
            eerst? Neem dan contact op met Teun voor de sleutel.
          </li>
          <li>
            Een opslagruimte huur je bij een vaste plek. Er zijn er maar een paar: vol is vol.
          </li>
        </ul>
      </Section>

      <Section id="vragen" title="Vragen?">
        <p>
          Mail naar{" "}
          <a href={`mailto:${config.organizationEmail}`} className="text-blue-700 underline">
            {config.organizationEmail}
          </a>
          . Nog geen lid? Vraag toegang aan via de{" "}
          <Link href="/" className="text-blue-700 underline">
            startpagina
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}
