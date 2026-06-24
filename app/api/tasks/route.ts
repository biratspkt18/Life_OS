import { NextResponse } from "next/server";
import { createTask, listTasks } from "@/lib/server/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listTasks());
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (!b.title || typeof b.title !== "string") {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  const task = await createTask({
    title: b.title,
    durationMinutes: Number(b.durationMinutes) || 30,
    importance: b.importance ?? "normal",
    scheduledStart: b.scheduledStart ?? null,
  });
  return NextResponse.json(task);
}
