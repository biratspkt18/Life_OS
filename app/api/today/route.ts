import { NextResponse } from "next/server";
import { getTodayItems } from "@/lib/server/today";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json({ error: "start and end required" }, { status: 400 });
  }
  const items = await getTodayItems(start, end);
  return NextResponse.json(items);
}
