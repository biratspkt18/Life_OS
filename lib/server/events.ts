import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { taskEvents, tasks } from "./db/schema";
import { getSettings } from "./settings";
import { buildDayShape } from "../dayShape";
import { addDays, startOfDay } from "../dates";
import {
  windowForDay,
  type Energy,
  type Importance,
  type TaskEventType,
  type TodayItem,
} from "../types";

/**
 * Append one row to the behavioral event log. Best-effort by design: a log
 * write must never fail or slow down the task write it describes (same
 * posture as the Google mirror), so the whole body is caught and ignored.
 */
export function logEvent(
  userId: string,
  e: {
    taskId: string | null;
    type: TaskEventType;
    tag?: string | null;
    energy?: Energy | null;
    payload?: Record<string, unknown>;
  },
): void {
  try {
    db.insert(taskEvents)
      .values({
        id: randomUUID(),
        userId,
        taskId: e.taskId,
        type: e.type,
        at: new Date().toISOString(),
        tag: e.tag ?? null,
        energy: e.energy ?? null,
        payload: e.payload ?? null,
      })
      .run();
  } catch (err) {
    console.warn("[events] log write failed (ignored):", err);
  }
}

/**
 * Whole-window free minutes for one of the user's days, for event payloads.
 * An approximation: built from the user's own scheduled tasks and their day
 * window only — Google-calendar busy would need a network fetch per write,
 * so it's excluded. The client may attach its truer number (which includes
 * Google events) via `context.freeMinutesDay`; store both, prefer the
 * client's when analyzing.
 */
export function freeMinutesForDay(userId: string, day: Date): number | null {
  try {
    const dayStart = startOfDay(day);
    const dayEnd = addDays(dayStart, 1);
    const items: TodayItem[] = db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .all()
      .filter((t) => {
        if (!t.scheduledStart) return false;
        const s = new Date(t.scheduledStart);
        return s >= dayStart && s < dayEnd;
      })
      .map((t) => ({
        id: t.id,
        title: t.title,
        start: t.scheduledStart,
        durationMinutes: t.durationMinutes,
        importance: t.importance as Importance,
        completed: t.completed,
        allDay: false,
        source: "lifeos" as const,
      }));
    const settings = getSettings(userId);
    const shape = buildDayShape(
      items,
      windowForDay(settings, dayStart),
      dayStart,
      new Date(),
      settings.defaultDurationMinutes,
    );
    return shape.freeMinutes;
  } catch {
    return null;
  }
}
