import createMollieClient from "@mollie/api-client";

export const mollie = createMollieClient({
  apiKey: process.env.MOLLIE_API_KEY!,
});

// Is deze Mollie-betaling al betaald of in behandeling, maar heeft de webhook het nog niet
// verwerkt? Dan geen tweede betaling laten starten. ("open" telt niet mee: dat is een
// checkout die nooit is afgerond, bv. tabblad gesloten - daar mag gewoon opnieuw.)
export async function isPaymentInProgress(paymentId: string | null): Promise<boolean> {
  if (!paymentId) return false;
  try {
    const payment = (await mollie.payments.get(paymentId)) as { status: string };
    return ["pending", "authorized", "paid"].includes(payment.status);
  } catch {
    return false;
  }
}
