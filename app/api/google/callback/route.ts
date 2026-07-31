import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/server/config";
import { exchangeCodeForIdentity, saveGoogleTokensForUser } from "@/lib/server/google";
import { findOrCreateUserFromGoogle } from "@/lib/server/users";
import { createSessionToken, SESSION_COOKIE } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error"); // e.g. access_denied
  const expected = req.cookies.get("g_state")?.value;

  // Behind a reverse proxy the request's own protocol can be http (Caddy→app is
  // plain HTTP on localhost), so prefer an explicit APP_ORIGIN in production and
  // fall back to the request origin for local dev.
  const appOrigin = config.appOrigin || url.origin;

  // On failure, bounce back to /login (not home) — an unauthenticated user who
  // declined consent would otherwise be redirected right back here by middleware.
  const fail = (reason: string) => {
    console.error(`[google] callback failed: ${reason}`);
    const to = new URL("/login", appOrigin);
    to.searchParams.set("error", reason);
    const r = NextResponse.redirect(to);
    r.cookies.set("g_state", "", { path: "/", maxAge: 0 });
    return r;
  };

  if (oauthError) return fail(oauthError);
  if (!code) return fail("no_code");
  if (!state || !expected) return fail("no_state_cookie");
  if (state !== expected) return fail("state_mismatch");

  let result;
  try {
    result = await exchangeCodeForIdentity(code);
  } catch (err) {
    console.error("[google] token exchange failed:", err);
    return fail("exchange_failed");
  }

  // Identity → the app user (created on first login), then persist calendar
  // access for that user. Both jobs, one consent.
  const user = findOrCreateUserFromGoogle(result.identity);
  saveGoogleTokensForUser(user.id, {
    refreshToken: result.refreshToken,
    accessToken: result.accessToken,
    accessTokenExpiry: result.accessTokenExpiry,
    email: result.identity.email,
  });

  // Log them in: sign a session cookie carrying their user id.
  const token = await createSessionToken(user.id);
  const home = new URL("/", appOrigin);
  home.searchParams.set("google", "connected");
  const res = NextResponse.redirect(home);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  res.cookies.set("g_state", "", { path: "/", maxAge: 0 });
  return res;
}
