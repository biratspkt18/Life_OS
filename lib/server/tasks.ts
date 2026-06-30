import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { tasks } from "./db/schema";
import * as calendar from "./calendar";
import { findConflict, type Conflict } from "./conflicts";
import type { Importance, Task } from "../types";

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
  };
}

export function listTasks(): Task[] {
  return db.select().from(tasks).all().map(toTask);
}

function getRow(id: string): Row | undefined {
  return db.select().from(tasks).where(eq(tasks.id, id)).get();
}

export interface NewTaskInput {
  title: string;
  durationMinutes: number;
  importance: Importance;
  scheduledStart: string | null;
  dueDate?: string | null;
  preferredDate?: string | null;
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  const now = new Date().toISOString();

  // Never let a new task land on top of an existing task or calendar event.
  if (input.scheduledStart) {
    const conflict = await findConflict(input.scheduledStart, input.durationMinutes);
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
  };
  db.insert(tasks).values({ ...task, pingedAt: null }).run();

  const eventId = await calendar.createEvent(task);
  if (eventId) {
    task.googleEventId = eventId;
    db.update(tasks).set({ googleEventId: eventId }).where(eq(tasks.id, task.id)).run();
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
  >
>;

export async function patchTask(id: string, patch: TaskPatch): Promise<Task | null> {
  const existing = getRow(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const rescheduled =
    patch.scheduledStart !== undefined && patch.scheduledStart !== existing.scheduledStart;

  // Keep completedAt consistent when `completed` flips and the caller didn't set it.
  let completedAt = patch.completedAt;
  if (patch.completed !== undefined && patch.completedAt === undefined) {
    completedAt = patch.completed ? now : null;
  }

  const merged: Task = {
    ...toTask(existing),
    ...patch,
    ...(completedAt !== undefined ? { completedAt } : {}),
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
    const conflict = await findConflict(merged.scheduledStart, merged.durationMinutes, id);
    if (conflict) throw new ConflictError(conflict);
  }

  // Reconcile the calendar event, then persist the (possibly new) event id.
  const eventId = await calendar.syncEvent(merged);
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
      googleEventId: eventId,
      updatedAt: now,
      ...(rescheduled ? { pingedAt: null } : {}),
    })
    .where(eq(tasks.id, id))
    .run();

  return merged;
}

export async function deleteTask(id: string): Promise<void> {
  const existing = getRow(id);
  db.delete(tasks).where(eq(tasks.id, id)).run();
  if (existing?.googleEventId) {
    await calendar.deleteEvent(existing.googleEventId);
  }
}
