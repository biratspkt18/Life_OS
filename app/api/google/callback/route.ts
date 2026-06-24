import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/server/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = req.cookies.get("g_state")?.value;

  const home = new URL("/", url.origin);

  if (!code || !state || !expected || state !== expected) {
    home.searchParams.set("google", "error");
    return NextResponse.redirect(home);
  }

  try {
    await exchangeCode(code);
    home.searchParams.set("google", "connected");
  } catch (err) {
    console.error("[google] callback failed:", err);
    home.searchParams.set("google", "error");
  }
  const res = NextResponse.redirect(home);
  res.cookies.set("g_state", "", { path: "/", maxAge: 0 });
  return res;
}
