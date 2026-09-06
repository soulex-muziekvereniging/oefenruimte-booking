import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Oefenruimte Boeken",
  description: "Boek een oefenruimte voor je band",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" className={`${geist.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900 font-[family-name:var(--font-geist)]">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <h1 className="text-xl font-bold">
              🎵 Oefenruimte Boeken
            </h1>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="bg-white border-t border-gray-200 mt-auto">
          <div className="max-w-5xl mx-auto px-4 py-4 text-sm text-gray-500 text-center">
            © {new Date().getFullYear()} Muziekstichting
          </div>
        </footer>
      </body>
    </html>
  );
}
