import { NextResponse } from "next/server";
import { saveSubscription, type BrowserSubscription } from "@/lib/server/push";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sub = (await req.json().catch(() => null)) as BrowserSubscription | null;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  saveSubscription(sub);
  return NextResponse.json({ ok: true });
}
