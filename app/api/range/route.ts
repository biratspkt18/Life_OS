import { NextResponse } from "next/server";
import { getRangeItems } from "@/lib/server/range";
import { parseRangeParams } from "@/lib/server/validate";
import { requireUserId } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await requireUserId();
  const url = new URL(req.url);
  const parsed = parseRangeParams(url.searchParams.get("start"), url.searchParams.get("end"));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const items = await getRangeItems(userId, parsed.value.start, parsed.value.end);
  return NextResponse.json(items);
}
