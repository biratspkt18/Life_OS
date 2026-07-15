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

/** Mint a 30-day signed session token identifying a specific user. */
export async function createSessionToken(userId: string): Promise<string> {
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

/**
 * Verify a session token and return the user id it identifies (the `sub`
 * claim), or null if the token is missing, tampered with, or expired. Edge-safe
 * (jose only), so `middleware.ts` can call it too.
 */
export async function verifySessionToken(token?: string): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
