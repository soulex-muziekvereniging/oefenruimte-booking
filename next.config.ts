import type { NextConfig } from "next";

// Het oude, automatisch toegekende adres (-six) stuurt door naar het vaste adres, met
// behoud van pad en query (oude links in mails blijven werken). /api blijft op beide
// adressen gewoon werken: Mollie volgt geen redirects bij webhooks van oudere betalingen.
const OLD_HOST = "oefenruimte-booking-six.vercel.app";
const NEW_ORIGIN = "https://oefenruimte-booking.vercel.app";

const nextConfig: NextConfig = {
  async redirects() {
    const has = [{ type: "host" as const, value: OLD_HOST }];
    return [
      { source: "/", has, destination: `${NEW_ORIGIN}/`, permanent: true },
      { source: "/:path((?!api/).*)", has, destination: `${NEW_ORIGIN}/:path`, permanent: true },
    ];
  },
};

export default nextConfig;
