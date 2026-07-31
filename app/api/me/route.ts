import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/server/session";
import { getUserById } from "@/lib/server/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's identity — for the "signed in as … / log out" row. */
export async function GET() {
  const userId = await requireUserId();
  const user = getUserById(userId);
  return NextResponse.json({ email: user?.email ?? null, name: user?.name ?? null });
}
