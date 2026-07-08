import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/server/google";

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
  const home = new URL("/", process.env.APP_ORIGIN ?? url.origin);

  // Surface *why* it failed so it isn't a silent dead end. The reason rides back
  // on the redirect (`?google=error&reason=…`) and is logged server-side.
  const fail = (reason: string) => {
    console.error(`[google] callback failed: ${reason}`);
    home.searchParams.set("google", "error");
    home.searchParams.set("reason", reason);
    const r = NextResponse.redirect(home);
    r.cookies.set("g_state", "", { path: "/", maxAge: 0 });
    return r;
  };

  if (oauthError) return fail(oauthError);
  if (!code) return fail("no_code");
  if (!state || !expected) return fail("no_state_cookie");
  if (state !== expected) return fail("state_mismatch");

  try {
    await exchangeCode(code);
  } catch (err) {
    console.error("[google] token exchange failed:", err);
    return fail("exchange_failed");
  }

  home.searchParams.set("google", "connected");
  const res = NextResponse.redirect(home);
  res.cookies.set("g_state", "", { path: "/", maxAge: 0 });
  return res;
}
