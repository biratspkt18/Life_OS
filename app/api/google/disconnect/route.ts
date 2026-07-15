import { NextResponse } from "next/server";
import { disconnectGoogle } from "@/lib/server/google";
import { requireUserId } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST() {
  const userId = await requireUserId();
  disconnectGoogle(userId);
  return NextResponse.json({ ok: true });
}
