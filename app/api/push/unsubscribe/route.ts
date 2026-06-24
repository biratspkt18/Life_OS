import { NextResponse } from "next/server";
import { removeSubscription } from "@/lib/server/push";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.endpoint === "string") removeSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}
