import crypto from "crypto";

// Stateless "mijn boekingen"-link: geen aparte databasetabel nodig, de e-mail en
// vervaltijd staan (ondertekend, dus niet te vervalsen) in de link zelf.
type Payload = { email: string; exp: number };

function sign(payloadStr: string): string {
  return crypto
    .createHmac("sha256", process.env.MAGIC_LINK_SECRET!)
    .update(payloadStr)
    .digest("base64url");
}

export function createMagicLinkToken(email: string, ttlMinutes = 30): string {
  const payload: Payload = {
    email: email.toLowerCase().trim(),
    exp: Date.now() + ttlMinutes * 60 * 1000,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadStr}.${sign(payloadStr)}`;
}

export function verifyMagicLinkToken(token: string): string | null {
  const [payloadStr, signature] = token.split(".");
  if (!payloadStr || !signature) return null;

  const expectedSignature = sign(payloadStr);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload: Payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString());
    if (Date.now() > payload.exp) return null;
    return payload.email;
  } catch {
    return null;
  }
}
