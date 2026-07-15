import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./auth";

// Server-only (imports next/headers, so it can't be used in edge middleware).
// This is the single place route handlers ask "who is making this request?".

/** The signed-in user's id, or null if the request has no valid session. */
export async function currentUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

/**
 * The signed-in user's id, or throw. Middleware already blocks unauthenticated
 * requests to `/api/*`, so reaching a route without a user is a programming
 * error, not a normal case — hence a throw rather than a returned null.
 */
export async function requireUserId(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new Error("No authenticated user");
  return id;
}
