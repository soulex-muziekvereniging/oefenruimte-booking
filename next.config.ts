import type { NextConfig } from "next";

// Het vaste adres is oefenruimte.soulex.nl. De oude vercel.app-adressen sturen daarheen
// door, met behoud van pad en query (oude links in mails blijven werken). /api blijft op
// alle adressen gewoon werken: Mollie volgt geen redirects bij webhooks van oudere betalingen.
const OLD_HOSTS = ["oefenruimte-booking.vercel.app", "oefenruimte-booking-six.vercel.app"];
const NEW_ORIGIN = "https://oefenruimte.soulex.nl";

const nextConfig: NextConfig = {
  async redirects() {
    return OLD_HOSTS.flatMap((host) => {
      const has = [{ type: "host" as const, value: host }];
      return [
        { source: "/", has, destination: `${NEW_ORIGIN}/`, permanent: true },
        { source: "/:path((?!api/).*)", has, destination: `${NEW_ORIGIN}/:path`, permanent: true },
      ];
    });
  },
};

export default nextConfig;
