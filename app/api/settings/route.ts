import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getSettings());
}

export async function PATCH(req: Request) {
  const patch = await req.json().catch(() => ({}));
  return NextResponse.json(saveSettings(patch));
}
