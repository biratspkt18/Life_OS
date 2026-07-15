import { NextResponse } from "next/server";
import { googleStatus } from "@/lib/server/google";
import { requireUserId } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  return NextResponse.json(googleStatus(userId));
}
