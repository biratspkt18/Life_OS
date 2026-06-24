import { NextResponse } from "next/server";
import { checkPasscode, createSessionToken, SESSION_COOKIE } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  if (!checkPasscode(passcode)) {
    return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
  }
  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
