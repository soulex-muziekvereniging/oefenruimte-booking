// Regel van het bestuur: elk lid in de ledenlijst heeft een telefoonnummer (bestaande
// leden zonder nummer blijven staan tot het wordt ingevuld; wissen kan niet meer).
export function cleanPhone(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Minstens 10 cijfers (06-nummer, vast nummer of +31...); spaties, streepjes en haakjes mogen.
export function isValidPhone(phone: string | null): phone is string {
  return !!phone && /^[0-9+()\-. ]+$/.test(phone) && phone.replace(/\D/g, "").length >= 10;
}

export const PHONE_REQUIRED_ERROR = "Vul een geldig telefoonnummer in (minstens 10 cijfers)";
