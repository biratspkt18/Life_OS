import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authUrl } from "@/lib/server/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
