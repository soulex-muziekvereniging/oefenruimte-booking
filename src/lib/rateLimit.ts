// Simpele in-memory rate limiter, per draaiende serverless-instantie. Reset bij een cold
// start en wordt niet gedeeld tussen meerdere gelijktijdige instanties - voor het volume
// van deze applicatie (kleine vereniging) is dat ruim voldoende om spam/brute-force te
// ontmoedigen, zonder de complexiteit van een externe store (bv. Redis) erbij te halen.
const attempts = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  entry.count += 1;
  return entry.count > maxAttempts;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
