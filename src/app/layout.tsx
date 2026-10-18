import type { Metadata } from "next";
import Image from "next/image";
import { Geist, Zilla_Slab } from "next/font/google";
import { config } from "@/config";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

// Schreefletter voor koppen, in de geest van de titels op soulex.nl.
const slab = Zilla_Slab({
  variable: "--font-slab",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "Soulex Oefenruimte boeken | Muziekvereniging Soulex",
  description:
    "Boek de geluidsdichte oefenruimte van Muziekvereniging Soulex in De Borgh, Budel - los, om de week of elke week vast.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" className={`${geist.variable} ${slab.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-page text-gray-900 font-[family-name:var(--font-geist)]">
        <header className="sticky top-0 z-40 bg-white border-b-4 border-soulex-orange shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <a href="/" className="flex items-center gap-3 min-w-0">
              <Image
                src="/soulex-badge.png"
                alt="Muziekvereniging Soulex"
                width={48}
                height={45}
                priority
                className="shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-base sm:text-xl font-bold text-blue-600 leading-tight font-[family-name:var(--font-slab)]">
                  Soulex Oefenruimte
                </span>
                <span className="block text-xs text-gray-500 truncate">
                  {config.organizationName}
                </span>
              </span>
            </a>
            {/* Navigatie: rustige links (de opvallende keuzes staan op de startpagina zelf). */}
            <nav aria-label="Hoofdmenu" className="shrink-0 flex items-center gap-3 sm:gap-6 text-sm font-medium">
              <a
                href="/handleiding"
                className="inline-flex items-center gap-1.5 text-blue-700 hover:text-blue-900 hover:underline underline-offset-4"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01" />
                </svg>
                {/* Op de telefoon alleen het icoontje, zodat de titel op één regel past */}
                <span className="sr-only sm:not-sr-only">Hulp</span>
              </a>
              <a
                href="/mijn-boekingen"
                className="inline-flex items-center gap-1.5 text-blue-700 hover:text-blue-900 hover:underline underline-offset-4"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M3 10h18M8 3v4M16 3v4" />
                </svg>
                Mijn boekingen
              </a>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="bg-blue-900 text-blue-100 mt-auto border-t border-page-line">
          <div className="max-w-5xl mx-auto px-4 py-6 text-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <Image src="/soulex-wordmark.png" alt="Soulex" width={110} height={34} />
            <p className="text-center">
              Oefenruimte in gemeenschapshuis De Borgh, Budel ·{" "}
              <a href={`mailto:${config.organizationEmail}`} className="underline hover:text-white">
                {config.organizationEmail}
              </a>{" "}
              ·{" "}
              <a href="https://soulex.nl" className="underline hover:text-white">
                soulex.nl
              </a>
            </p>
            <p className="text-blue-300">© {new Date().getFullYear()} {config.organizationName}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
