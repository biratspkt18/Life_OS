import { NextRequest, NextResponse } from "next/server";
import { appendFileSync } from "node:fs";
import { exchangeCode } from "@/lib/server/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMP debug: append what happens in the OAuth callback to a readable file.
const DEBUG_LOG = "/tmp/lifeos-oauth-debug.log";
function dbg(msg: string) {
  try {
    appendFileSync(DEBUG_LOG, `${new Date().toISOString()}  ${msg}\n`);
  } catch {
    /* ignore */
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error"); // e.g. access_denied
  const expected = req.cookies.get("g_state")?.value;

  const home = new URL("/", url.origin);

  dbg(
    `callback hit: origin=${url.origin} hasCode=${!!code} hasState=${!!state} hasCookie=${!!expected} oauthError=${oauthError ?? "none"}`,
  );

  // Surface *why* it failed so it isn't a silent dead end.
  const fail = (reason: string) => {
    dbg(`FAILED: ${reason}`);
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
    dbg(`exchange_failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error("[google] token exchange failed:", err);
    return fail("exchange_failed");
  }

  dbg("SUCCESS: tokens stored");
  home.searchParams.set("google", "connected");
  const res = NextResponse.redirect(home);
  res.cookies.set("g_state", "", { path: "/", maxAge: 0 });
  return res;
}
