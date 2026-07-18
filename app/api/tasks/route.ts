import { NextResponse } from "next/server";
import { ConflictError, createTask, listTasks } from "@/lib/server/tasks";
import { parseEventContext, parseNewTask } from "@/lib/server/validate";
import { requireUserId } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  return NextResponse.json(listTasks(userId));
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseNewTask(b);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  try {
    const task = await createTask(userId, parsed.value, { context: parseEventContext(b.context) });
    return NextResponse.json(task);
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json({ error: err.message, conflict: err.conflict }, { status: 409 });
    }
    throw err;
  }
}
