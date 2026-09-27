import { config } from "@/config";

// Instelbare WhatsApp-berichten (beheer > Instellingen). Opgeslagen in de tabel settings
// onder "whatsapp_templates"; dit zijn de standaardteksten.
// Invulvelden: {naam} {band} {datum} {dagdeel} {vereniging}
export type WhatsappTemplates = {
  repetition: string; // over een specifieke repetitie/boeking (kalendervenster)
  general: string; // algemeen (ledenlijst, vaste reserveringen)
};

export const WHATSAPP_PLACEHOLDERS = ["{naam}", "{band}", "{datum}", "{dagdeel}", "{vereniging}"];

export function defaultWhatsappTemplates(): WhatsappTemplates {
  return {
    repetition: "Hoi {naam}, hier {vereniging} over jullie repetitie op {datum} ({dagdeel}): ",
    general: "Hoi {naam}, hier {vereniging} over de oefenruimte: ",
  };
}

export function fillTemplate(
  template: string,
  values: { naam?: string; band?: string; datum?: string; dagdeel?: string }
): string {
  return template
    .replaceAll("{naam}", values.naam ?? "")
    .replaceAll("{band}", values.band ?? "")
    .replaceAll("{datum}", values.datum ?? "")
    .replaceAll("{dagdeel}", values.dagdeel ?? "")
    .replaceAll("{vereniging}", config.organizationName);
}

// Maximaal 500 tekens per bericht, leeg = standaardtekst.
export function parseWhatsappTemplates(input: unknown): WhatsappTemplates {
  const obj = (input ?? {}) as Record<string, unknown>;
  const defaults = defaultWhatsappTemplates();
  const clean = (v: unknown, fallback: string) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : fallback;
  return {
    repetition: clean(obj.repetition, defaults.repetition),
    general: clean(obj.general, defaults.general),
  };
}
