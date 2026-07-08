import { SignJWT, jwtVerify } from "jose";

// Edge-safe: only depends on `jose` (no DB / native modules) so middleware can use it.

export const SESSION_COOKIE = "lifeos_session";

function secret(): Uint8Array {
  const v = process.env.COOKIE_SECRET;
  if (!v) {
    // Fail CLOSED in production: signing sessions with a source-visible
    // constant would let anyone mint a valid cookie.
    if (process.env.NODE_ENV === "production") {
      throw new Error("COOKIE_SECRET must be set in production");
    }
    console.warn("[auth] COOKIE_SECRET unset — using the insecure dev fallback");
    return new TextEncoder().encode("dev-insecure-secret-change-me");
  }
  return new TextEncoder().encode(v);
}

/** Mint a 30-day signed session token. */
export async function createSessionToken(): Promise<string> {
  return await new SignJWT({ sub: "app" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifySessionToken(token?: string): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check a typed passcode. Unset APP_PASSCODE keeps dev open but fails CLOSED
 * in production (an env that silently didn't load must not unlock the app).
 */
export function checkPasscode(input: string): boolean {
  const expected = process.env.APP_PASSCODE;
  if (!expected) return process.env.NODE_ENV !== "production";
  // Constant-time compare without node:crypto, so middleware stays edge-safe.
  const a = new TextEncoder().encode(input);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
