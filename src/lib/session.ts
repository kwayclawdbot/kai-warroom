const COOKIE_NAME = "kai_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Buffer.from(sig).toString("base64url");
}

export async function signSession(secret: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${issuedAt}`;
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifySession(
  secret: string,
  cookieValue: string | undefined,
): Promise<boolean> {
  if (!cookieValue) return false;
  const [issuedAt, sig] = cookieValue.split(".");
  if (!issuedAt || !sig) return false;
  const issuedAtNum = Number(issuedAt);
  if (!Number.isFinite(issuedAtNum)) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - issuedAtNum;
  if (ageSeconds < 0 || ageSeconds > SESSION_TTL_SECONDS) return false;
  const expectedSig = await hmac(secret, issuedAt);
  return timingSafeEqual(sig, expectedSig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;
