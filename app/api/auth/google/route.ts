import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authUrl } from "@/lib/server/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public (under the /api/auth prefix): this is the "Continue with Google" entry
// point, reachable while logged out. It sends the browser to Google's consent
// screen; /api/google/callback finishes the login.
export async function GET() {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.json(
      { error: "Google OAuth is not configured (see .env)" },
      { status: 500 },
    );
  }
  const state = randomUUID();
  const res = NextResponse.redirect(authUrl(state));
  // CSRF: echo this back in the callback. 30 min, so a slow consent screen
  // (2FA, account picker, reading the scopes) doesn't strand the flow.
  res.cookies.set("g_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 1800,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
