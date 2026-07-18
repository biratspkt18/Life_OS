import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { tasks } from "@/lib/server/db/schema";
import { requireUserId } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The user's tags, derived from their tasks (most-used first). Tags have no
 * table of their own — they're born from use and fade from disuse, so the
 * distinct values on the task list *are* the tag list.
 */
export async function GET() {
  const userId = await requireUserId();
  const counts = new Map<string, number>();
  for (const row of db
    .select({ tag: tasks.tag })
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .all()) {
    if (row.tag) counts.set(row.tag, (counts.get(row.tag) ?? 0) + 1);
  }
  const tags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
  return NextResponse.json(tags);
}
