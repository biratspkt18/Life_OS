import { NextResponse } from "next/server";
import { logEvent } from "@/lib/server/events";
import { getTask } from "@/lib/server/tasks";
import { requireUserId } from "@/lib/server/session";
import { CLIENT_EVENT_TYPES, type ClientEventType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fire-and-forget log endpoint for the few events only the browser can see
 * (a breakdown prompt being shown or dismissed). Everything else in the
 * event log is derived server-side from real DB transitions — this route
 * accepts nothing outside the small client whitelist.
 */
export async function POST(req: Request) {
  const userId = await requireUserId();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const type = b.type;
  if (
    typeof type !== "string" ||
    !(CLIENT_EVENT_TYPES as readonly string[]).includes(type)
  ) {
    return NextResponse.json({ error: "unknown event type" }, { status: 400 });
  }

  const taskId = typeof b.taskId === "string" && b.taskId.length <= 64 ? b.taskId : null;

  // Payload is optional telemetry; oversized or misshapen payloads are
  // dropped silently rather than rejected.
  let payload: Record<string, unknown> | undefined;
  if (b.payload && typeof b.payload === "object" && !Array.isArray(b.payload)) {
    try {
      if (JSON.stringify(b.payload).length <= 2048) {
        payload = b.payload as Record<string, unknown>;
      }
    } catch {
      // non-serializable → drop
    }
  }

  const task = taskId ? getTask(userId, taskId) : null;
  logEvent(userId, {
    taskId,
    type: type as ClientEventType,
    tag: task?.tag ?? null,
    energy: task?.energy ?? null,
    payload,
  });
  return NextResponse.json({ ok: true });
}
