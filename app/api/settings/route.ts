import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/server/settings";
import { requireUserId } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  return NextResponse.json(getSettings(userId));
}

export async function PATCH(req: Request) {
  const userId = await requireUserId();
  const patch = await req.json().catch(() => ({}));
  return NextResponse.json(saveSettings(userId, patch));
}
