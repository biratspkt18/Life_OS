import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./lib/server/auth";

// Paths reachable without a session. The Google OAuth callback is an external
// redirect from Google (it can't carry our session reliably), so it must be
// public — its own `g_state` CSRF cookie guards it instead.
const PUBLIC = ["/login", "/api/auth", "/api/push/vapid", "/api/google/callback"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Redirect unauthenticated page loads to /login on the PUBLIC origin.
  //
  // `req.nextUrl` reflects the address the app is bound to (127.0.0.1:3000)
  // rather than the public host, so an absolute redirect built from it sends
  // users to localhost. Next middleware also rejects a *relative* Location, so
  // we reconstruct the real origin from, in order of trust:
  //   1. APP_ORIGIN — the configured public URL (same source the OAuth redirect
  //      uses); set in production, absent in local dev.
  //   2. the reverse proxy's forwarded headers (Caddy sets X-Forwarded-Host /
  //      -Proto), falling back to the raw Host header.
  //   3. the request's own origin — correct for local dev with no proxy.
  const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const forwardedProto =
    req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(/:$/, "");
  const origin =
    process.env.APP_ORIGIN ??
    (forwardedHost ? `${forwardedProto}://${forwardedHost}` : req.nextUrl.origin);
  return NextResponse.redirect(new URL("/login", origin));
}

export const config = {
  // Guard everything except Next internals and public static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.svg|manifest.webmanifest|sw.js).*)"],
};
