"use client";
import { mutate } from "swr";
import type { Importance, Settings, Task, TodayItem } from "./types";

export const TASKS_KEY = "/api/tasks";
export const SETTINGS_KEY = "/api/settings";

/**
 * Every SWR cache that renders a task's completion state. The day views read
 * from `/api/today?…`, the month grid from `/api/range?…`, and the raw list
 * (inbox / loose ends) from `/api/tasks` — so a completion has to touch all
 * three, not just `/api/tasks`.
 */
function isItemCacheKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    (key === TASKS_KEY || key.startsWith("/api/today") || key.startsWith("/api/range"))
  );
}

/** Immutably flip `completed` (and `completedAt`, where present) on one id. */
function withCompleted(
  list: Task[] | TodayItem[] | undefined,
  id: string,
  completed: boolean,
): Task[] | TodayItem[] | undefined {
  if (!Array.isArray(list)) return list;
  let changed = false;
  const next = (list as (Task | TodayItem)[]).map((item) => {
    if (item.id !== id) return item;
    changed = true;
    const patched = { ...item, completed };
    if ("completedAt" in item) {
      (patched as Task).completedAt = completed ? new Date().toISOString() : null;
    }
    return patched;
  });
  return (changed ? next : list) as Task[] | TodayItem[];
}

/** The clashing task/event the server reported (HTTP 409). */
export interface Conflict {
  title: string;
  start: string;
  end: string;
  source: "lifeos" | "google";
}

/** Thrown by createTask/rescheduleTask when the slot is already taken. */
export class ConflictError extends Error {
  conflict: Conflict;
  constructor(conflict: Conflict) {
    super(`Time overlaps "${conflict.title}"`);
    this.name = "ConflictError";
    this.conflict = conflict;
  }
}

async function req<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    if (res.status === 409) {
      const body = await res.json().catch(() => null);
      if (body?.conflict) throw new ConflictError(body.conflict);
    }
    throw new Error(`${opts?.method ?? "GET"} ${url} → ${res.status}`);
  }
  return res.json();
}

export interface NewTaskInput {
  title: string;
  durationMinutes: number;
  importance: Importance;
  scheduledStart: Date | null;
  dueDate?: Date | null;
  preferredDate?: Date | null;
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  const task = await req<Task>(TASKS_KEY, {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      durationMinutes: input.durationMinutes,
      importance: input.importance,
      scheduledStart: input.scheduledStart ? input.scheduledStart.toISOString() : null,
      dueDate: input.dueDate ? input.dueDate.toISOString() : null,
      preferredDate: input.preferredDate ? input.preferredDate.toISOString() : null,
    }),
  });
  // Optimistically drop the new task into the raw list so the To-do list and the
  // Today "Due today" section update *now*, without waiting on a refetch.
  await mutate(
    TASKS_KEY,
    (list?: Task[]) => (Array.isArray(list) ? [task, ...list] : list),
    { revalidate: false },
  );
  // Then reconcile every view against the server (day / month included).
  mutate(isItemCacheKey);
  return task;
}

export async function setCompleted(id: string, completed: boolean): Promise<void> {
  // Optimistic: flip the checkbox everywhere it shows *now*, before the network
  // round-trip, so checking a task feels instant. `revalidate: false` keeps the
  // patched value on screen instead of snapping back to the stale fetch.
  await mutate(
    isItemCacheKey,
    (list?: Task[] | TodayItem[]) => withCompleted(list, id, completed),
    { revalidate: false },
  );

  try {
    await req(`${TASKS_KEY}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ completed }),
    });
  } catch (err) {
    // Server rejected it — revalidate to roll the optimistic change back.
    mutate(isItemCacheKey);
    throw err;
  }

  // Confirm against server truth (completedAt, any reconciliation).
  mutate(isItemCacheKey);
}

export async function rescheduleTask(id: string, newStart: Date): Promise<void> {
  await req(`${TASKS_KEY}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      scheduledStart: newStart.toISOString(),
      completed: false,
      completedAt: null,
    }),
  });
  mutate(isItemCacheKey);
}

/** Immutably move one id to `startIso` across both cache shapes (Task vs TodayItem). */
function withStart(
  list: Task[] | TodayItem[] | undefined,
  id: string,
  startIso: string,
): Task[] | TodayItem[] | undefined {
  if (!Array.isArray(list)) return list;
  let changed = false;
  const next = (list as (Task | TodayItem)[]).map((item) => {
    if (item.id !== id) return item;
    changed = true;
    // The raw list (`/api/tasks`) holds Tasks with `scheduledStart`; the day and
    // month caches hold TodayItems with `start`. Patch whichever this row is.
    if ("scheduledStart" in item) {
      return { ...item, scheduledStart: startIso, completed: false, completedAt: null };
    }
    return { ...item, start: startIso, completed: false };
  });
  return (changed ? next : list) as Task[] | TodayItem[];
}

/**
 * Reschedule with an **optimistic** move — the block jumps to its new time in
 * every view immediately, before the network round-trip, so a drag-drop on the
 * timeline settles exactly where it was dropped instead of snapping back to the
 * old slot until the refetch lands. Rolls back on error (e.g. a server 409).
 */
export async function rescheduleTaskOptimistic(id: string, newStart: Date): Promise<void> {
  const iso = newStart.toISOString();
  await mutate(
    isItemCacheKey,
    (list?: Task[] | TodayItem[]) => withStart(list, id, iso),
    { revalidate: false },
  );
  try {
    await req(`${TASKS_KEY}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ scheduledStart: iso, completed: false, completedAt: null }),
    });
  } catch (err) {
    mutate(isItemCacheKey); // revert the optimistic move
    throw err;
  }
  mutate(isItemCacheKey);
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  await req(`${TASKS_KEY}/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  mutate(isItemCacheKey);
}

export async function dropTask(id: string): Promise<void> {
  await req(`${TASKS_KEY}/${id}`, { method: "DELETE" });
  mutate(isItemCacheKey);
}

/** One-off fetch of all tasks (used by sequential re-homing in the loop). */
export async function fetchTasks(): Promise<Task[]> {
  return req<Task[]>(TASKS_KEY);
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await req(SETTINGS_KEY, { method: "PATCH", body: JSON.stringify(patch) });
  mutate(SETTINGS_KEY);
}
