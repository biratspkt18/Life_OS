import { SignJWT, jwtVerify } from "jose";

// Edge-safe: only depends on `jose` (no DB / native modules) so middleware can use it.

export const SESSION_COOKIE = "lifeos_session";

function secret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.COOKIE_SECRET ?? "dev-insecure-secret-change-me",
  );
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
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}

/** Check a typed passcode. With no APP_PASSCODE set, the app is open (dev). */
export function checkPasscode(input: string): boolean {
  const expected = process.env.APP_PASSCODE;
  if (!expected) return true;
  return input === expected;
}
