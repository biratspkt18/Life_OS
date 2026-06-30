import { NextResponse } from "next/server";
import { getRangeItems } from "@/lib/server/range";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json({ error: "start and end required" }, { status: 400 });
  }
  const items = await getRangeItems(start, end);
  return NextResponse.json(items);
}
