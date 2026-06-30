import { NextResponse } from "next/server";
import { ConflictError, createTask, listTasks } from "@/lib/server/tasks";

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
  try {
    const task = await createTask({
      title: b.title,
      durationMinutes: Number(b.durationMinutes) || 30,
      importance: b.importance ?? "normal",
      scheduledStart: b.scheduledStart ?? null,
      dueDate: b.dueDate ?? null,
      preferredDate: b.preferredDate ?? null,
    });
    return NextResponse.json(task);
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json({ error: err.message, conflict: err.conflict }, { status: 409 });
    }
    throw err;
  }
}
