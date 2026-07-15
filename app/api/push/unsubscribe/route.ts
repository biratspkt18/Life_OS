import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/server/session";
import { removeSubscription } from "@/lib/server/push";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await requireUserId();
  const body = await req.json().catch(() => ({}));
  if (typeof body.endpoint === "string") removeSubscription(userId, body.endpoint);
  return NextResponse.json({ ok: true });
}
