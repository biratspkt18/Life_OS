import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { tasks } from "./db/schema";
import * as calendar from "./calendar";
import { findConflict, type Conflict } from "./conflicts";
import { freeMinutesForDay, logEvent } from "./events";
import { computeDeferralDelta } from "../deferral";
import type { Energy, Importance, Task, TaskEventContext, TaskEventType } from "../types";

type Row = typeof tasks.$inferSelect;

/** Thrown when a booking would overlap an existing task or calendar event. */
export class ConflictError extends Error {
  conflict: Conflict;
  constructor(conflict: Conflict) {
    super(`Time overlaps "${conflict.title}"`);
    this.name = "ConflictError";
    this.conflict = conflict;
  }
}

function toTask(r: Row): Task {
  return {
    id: r.id,
    title: r.title,
    durationMinutes: r.durationMinutes,
    importance: r.importance as Importance,
    scheduledStart: r.scheduledStart,
    dueDate: r.dueDate,
    preferredDate: r.preferredDate,
    googleEventId: r.googleEventId,
    completed: r.completed,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    tag: r.tag,
    energy: r.energy as Energy | null,
    deferralCount: r.deferralCount,
  };
}

export function listTasks(userId: string): Task[] {
  return db.select().from(tasks).where(eq(tasks.userId, userId)).all().map(toTask);
}

/** One row, scoped to its owner — a wrong (or forged) id from another user
 *  simply returns undefined, so every caller is a 404 rather than a leak. */
function getRow(userId: string, id: string): Row | undefined {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .get();
}

export function getTask(userId: string, id: string): Task | null {
  const row = getRow(userId, id);
  return row ? toTask(row) : null;
}

export interface NewTaskInput {
  title: string;
  durationMinutes: number;
  importance: Importance;
  scheduledStart: string | null;
  dueDate?: string | null;
  preferredDate?: string | null;
  tag?: string | null;
  energy?: Energy | null;
}

export interface CreateTaskOptions {
  /** Where the task came from, for the event log. Defaults to "capture". */
  source?: "capture" | "breakdown";
  /** Set when this task is a breakdown step; links it to its late parent. */
  parentTaskId?: string;
  /** Client telemetry (what was proposed vs chosen); log-only. */
  context?: TaskEventContext;
}

export async function createTask(
  userId: string,
  input: NewTaskInput,
  opts: CreateTaskOptions = {},
): Promise<Task> {
  const now = new Date().toISOString();

  // Never let a new task land on top of an existing task or calendar event.
  if (input.scheduledStart) {
    const conflict = await findConflict(userId, input.scheduledStart, input.durationMinutes);
    if (conflict) throw new ConflictError(conflict);
  }

  const task: Task = {
    id: randomUUID(),
    title: input.title.trim(),
    durationMinutes: input.durationMinutes,
    importance: input.importance,
    scheduledStart: input.scheduledStart,
    dueDate: input.dueDate ?? null,
    preferredDate: input.preferredDate ?? null,
    googleEventId: null,
    completed: false,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    tag: input.tag ?? null,
    energy: input.energy ?? null,
    deferralCount: 0,
  };
  db.insert(tasks).values({ ...task, userId, pingedAt: null }).run();

  logEvent(userId, {
    taskId: task.id,
    type: "created",
    tag: task.tag,
    energy: task.energy,
    payload: {
      title: task.title,
      durationMinutes: task.durationMinutes,
      importance: task.importance,
      scheduledStart: task.scheduledStart,
      dueDate: task.dueDate,
      preferredDate: task.preferredDate,
      source: opts.source ?? "capture",
      ...(opts.parentTaskId ? { parentTaskId: opts.parentTaskId } : {}),
      freeMinutesDayApprox: freeMinutesForDay(
        userId,
        task.scheduledStart ? new Date(task.scheduledStart) : new Date(),
      ),
      ...(opts.context ? { context: opts.context } : {}),
    },
  });

  const eventId = await calendar.createEvent(userId, task);
  if (eventId) {
    task.googleEventId = eventId;
    db.update(tasks)
      .set({ googleEventId: eventId })
      .where(and(eq(tasks.id, task.id), eq(tasks.userId, userId)))
      .run();
  }
  return task;
}

export type TaskPatch = Partial<
  Pick<
    Task,
    | "title"
    | "durationMinutes"
    | "importance"
    | "scheduledStart"
    | "dueDate"
    | "preferredDate"
    | "completed"
    | "completedAt"
    | "tag"
    | "energy"
  >
>;

export async function patchTask(
  userId: string,
  id: string,
  patch: TaskPatch,
  context?: TaskEventContext,
): Promise<Task | null> {
  const existing = getRow(userId, id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const rescheduled =
    patch.scheduledStart !== undefined && patch.scheduledStart !== existing.scheduledStart;

  // Server-owned deferral counter: +1 only when the user moved a date field to
  // a different calendar day (see lib/deferral.ts for the full rule).
  const deferralDelta = computeDeferralDelta(toTask(existing), patch);
  const nextDeferralCount = existing.deferralCount + deferralDelta;

  // Keep completedAt consistent when `completed` flips and the caller didn't set it.
  let completedAt = patch.completedAt;
  if (patch.completed !== undefined && patch.completedAt === undefined) {
    completedAt = patch.completed ? now : null;
  }

  const merged: Task = {
    ...toTask(existing),
    ...patch,
    ...(completedAt !== undefined ? { completedAt } : {}),
    deferralCount: nextDeferralCount,
    updatedAt: now,
  };

  // If this change moves the task or changes its length while it stays on the
  // calendar, make sure the new slot doesn't collide with anything. (Completing
  // or merely renaming a task never needs this check.)
  const durationChanged =
    patch.durationMinutes !== undefined && patch.durationMinutes !== existing.durationMinutes;
  // Validate whenever the slot actually moves/grows — even for a completed task
  // (logging it at a different time must still land somewhere free). A plain
  // complete-in-place doesn't move the slot, so it skips this.
  if (merged.scheduledStart && (rescheduled || durationChanged)) {
    const conflict = await findConflict(userId, merged.scheduledStart, merged.durationMinutes, id);
    if (conflict) throw new ConflictError(conflict);
  }

  // Reconcile the calendar event, then persist the (possibly new) event id.
  const eventId = await calendar.syncEvent(userId, merged);
  merged.googleEventId = eventId;

  db.update(tasks)
    .set({
      title: merged.title,
      durationMinutes: merged.durationMinutes,
      importance: merged.importance,
      scheduledStart: merged.scheduledStart,
      dueDate: merged.dueDate,
      preferredDate: merged.preferredDate,
      completed: merged.completed,
      completedAt: merged.completedAt,
      tag: merged.tag,
      energy: merged.energy,
      deferralCount: nextDeferralCount,
      googleEventId: eventId,
      updatedAt: now,
      ...(rescheduled ? { pingedAt: null } : {}),
    })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .run();

  // One event per patch, the most significant transition winning; the full
  // field diff always rides in the payload so nothing is lost to the ranking.
  const before = toTask(existing);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(patch) as (keyof TaskPatch)[]) {
    if (before[key] !== merged[key]) changes[key] = { from: before[key], to: merged[key] };
  }
  let type: TaskEventType;
  if (patch.completed === true && !before.completed) type = "completed";
  else if (patch.completed === false && before.completed) type = "uncompleted";
  else if (deferralDelta > 0) type = "deferred";
  else if (!before.scheduledStart && merged.scheduledStart) type = "scheduled";
  else if (before.scheduledStart && !merged.scheduledStart && patch.scheduledStart !== undefined)
    type = "unscheduled";
  else if (rescheduled) type = "rescheduled";
  else type = "edited";

  logEvent(userId, {
    taskId: id,
    type,
    tag: merged.tag,
    energy: merged.energy,
    payload: {
      changes,
      deferralCount: nextDeferralCount,
      deferralDelta,
      freeMinutesDayApprox: freeMinutesForDay(
        userId,
        merged.scheduledStart ? new Date(merged.scheduledStart) : new Date(),
      ),
      ...(context ? { context } : {}),
    },
  });

  return merged;
}

export async function deleteTask(
  userId: string,
  id: string,
  opts: { reason?: "breakdown" } = {},
): Promise<void> {
  const existing = getRow(userId, id);
  if (!existing) return;
  db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).run();
  logEvent(userId, {
    taskId: id,
    type: "deleted",
    tag: existing.tag,
    energy: existing.energy as Energy | null,
    payload: {
      title: existing.title,
      completed: existing.completed,
      scheduledStart: existing.scheduledStart,
      deferralCount: existing.deferralCount,
      ...(opts.reason ? { reason: opts.reason } : {}),
    },
  });
  if (existing.googleEventId) {
    await calendar.deleteEvent(userId, existing.googleEventId);
  }
}
