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
    "Boek de geluidsdichte oefenruimte van Muziekvereniging Soulex in De Borgh, Budel - los, als pakket of vast.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" className={`${geist.variable} ${slab.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900 font-[family-name:var(--font-geist)]">
        <header className="bg-white border-b-4 border-soulex-orange">
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
                <span className="block text-lg sm:text-xl font-bold text-blue-600 leading-tight font-[family-name:var(--font-slab)]">
                  Soulex Oefenruimte
                </span>
                <span className="block text-xs text-gray-500 truncate">
                  {config.organizationName}
                </span>
              </span>
            </a>
            <a
              href="/mijn-boekingen"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 shrink-0"
            >
              Mijn boekingen
            </a>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="bg-blue-900 text-blue-100 mt-auto">
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
