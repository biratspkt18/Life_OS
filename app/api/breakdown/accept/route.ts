import { NextResponse } from "next/server";
import { logEvent } from "@/lib/server/events";
import { createTask, deleteTask, getTask } from "@/lib/server/tasks";
import { getSettings } from "@/lib/server/settings";
import { requireUserId } from "@/lib/server/session";
import { parseBreakdownAccept } from "@/lib/server/validate";
import type { Task } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Replace a task with the (user-approved, possibly edited) steps: each step
 * becomes an unscheduled to-do inheriting the parent's tag/energy/importance,
 * then the parent is deleted. Children are created FIRST and the parent
 * deleted LAST, so a mid-way failure leaves both — recoverable clutter,
 * never lost work. Children are unscheduled, so no Google events are touched
 * until the user schedules them; deleting the parent removes its event if it
 * had one (normal delete path).
 */
export async function POST(req: Request) {
  const userId = await requireUserId();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseBreakdownAccept(b);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { taskId, steps, llmUsed, edited } = parsed.value;

  const parent = getTask(userId, taskId);
  if (!parent) return NextResponse.json({ error: "not found" }, { status: 404 });

  const defaultDuration = getSettings(userId).defaultDurationMinutes;
  const created: Task[] = [];
  for (const step of steps) {
    created.push(
      await createTask(
        userId,
        {
          title: step,
          durationMinutes: defaultDuration,
          importance: parent.importance,
          scheduledStart: null,
          dueDate: null,
          preferredDate: null,
          tag: parent.tag,
          energy: parent.energy,
        },
        { source: "breakdown", parentTaskId: parent.id },
      ),
    );
  }

  logEvent(userId, {
    taskId: parent.id,
    type: "broken_down",
    tag: parent.tag,
    energy: parent.energy,
    payload: {
      title: parent.title,
      stepIds: created.map((t) => t.id),
      stepTitles: steps,
      llmUsed,
      edited,
      deferralCount: parent.deferralCount,
    },
  });

  await deleteTask(userId, parent.id, { reason: "breakdown" });

  return NextResponse.json({ steps: created });
}
