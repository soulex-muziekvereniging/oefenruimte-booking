import crypto from "crypto";

const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 uur
const RESET_TTL_MS = 30 * 60 * 1000; // 30 minuten

function secret(): string {
  return process.env.ADMIN_SESSION_SECRET!;
}

function sign(payloadStr: string): string {
  return crypto.createHmac("sha256", secret()).update(payloadStr).digest("base64url");
}

function verifySignature(payloadStr: string, signature: string): boolean {
  const expected = sign(payloadStr);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- Wachtwoord hashen/verifiëren (scrypt, geen extra dependency nodig) ---

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(candidate);
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- Sessie-cookie na inloggen ---

type SessionPayload = { adminId: string; exp: number };

export function createSessionToken(adminId: string): string {
  const payload: SessionPayload = { adminId, exp: Date.now() + SESSION_TTL_MS };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadStr}.${sign(payloadStr)}`;
}

export function verifySessionToken(token: string): string | null {
  const [payloadStr, signature] = token.split(".");
  if (!payloadStr || !signature || !verifySignature(payloadStr, signature)) return null;

  try {
    const payload: SessionPayload = JSON.parse(Buffer.from(payloadStr, "base64url").toString());
    if (Date.now() > payload.exp) return null;
    return payload.adminId;
  } catch {
    return null;
  }
}

export { SESSION_COOKIE };

// --- Wachtwoord instellen/resetten via e-maillink (zelfde token voor "eerste keer
// instellen" als voor "vergeten" - er is geen inhoudelijk verschil tussen die twee) ---

type ResetPayload = { email: string; exp: number };

export function createResetToken(email: string): string {
  const payload: ResetPayload = {
    email: email.toLowerCase().trim(),
    exp: Date.now() + RESET_TTL_MS,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadStr}.${sign(payloadStr)}`;
}

export function verifyResetToken(token: string): string | null {
  const [payloadStr, signature] = token.split(".");
  if (!payloadStr || !signature || !verifySignature(payloadStr, signature)) return null;

  try {
    const payload: ResetPayload = JSON.parse(Buffer.from(payloadStr, "base64url").toString());
    if (Date.now() > payload.exp) return null;
    return payload.email;
  } catch {
    return null;
  }
}
