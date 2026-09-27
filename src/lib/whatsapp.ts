// Link die WhatsApp opent met een kant-en-klaar bericht (wa.me). Gratis en officieel:
// de beheerder drukt zelf op verzenden. Geeft null als het nummer niet bruikbaar is.
// Nederlandse nummers (06-12345678, +31 6 ...) worden omgezet naar 316...
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = "31" + digits.slice(1);
  // Te kort/lang, of een dummynummer als 06-00000000: geen WhatsApp-knop.
  if (!/^\d{10,15}$/.test(digits) || /^316?0+$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
