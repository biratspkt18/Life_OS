"use client";
import { mutate } from "swr";
import type {
  ClientEventType,
  Energy,
  Importance,
  Settings,
  Task,
  TaskEventContext,
  TodayItem,
} from "./types";

export const TASKS_KEY = "/api/tasks";
export const SETTINGS_KEY = "/api/settings";
export const TAGS_KEY = "/api/tags";

/**
 * Every SWR cache that renders task state. The day views read from
 * `/api/today?…`, the month grid from `/api/range?…`, the raw list
 * (inbox / loose ends) from `/api/tasks`, and the capture sheet's tag chips
 * from `/api/tags` (derived from tasks, so any task write can change it) —
 * a mutation has to touch all four, not just `/api/tasks`.
 */
function isItemCacheKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    (key === TASKS_KEY ||
      key === TAGS_KEY ||
      key.startsWith("/api/today") ||
      key.startsWith("/api/range"))
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
  tag?: string | null;
  energy?: Energy | null;
}

export async function createTask(
  input: NewTaskInput,
  context?: TaskEventContext,
): Promise<Task> {
  const task = await req<Task>(TASKS_KEY, {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      durationMinutes: input.durationMinutes,
      importance: input.importance,
      scheduledStart: input.scheduledStart ? input.scheduledStart.toISOString() : null,
      dueDate: input.dueDate ? input.dueDate.toISOString() : null,
      preferredDate: input.preferredDate ? input.preferredDate.toISOString() : null,
      tag: input.tag ?? null,
      energy: input.energy ?? null,
      ...(context ? { context } : {}),
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

export async function rescheduleTask(
  id: string,
  newStart: Date,
  context?: TaskEventContext,
): Promise<void> {
  await req(`${TASKS_KEY}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      scheduledStart: newStart.toISOString(),
      completed: false,
      completedAt: null,
      ...(context ? { context } : {}),
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
export async function rescheduleTaskOptimistic(
  id: string,
  newStart: Date,
  context?: TaskEventContext,
): Promise<void> {
  const iso = newStart.toISOString();
  await mutate(
    isItemCacheKey,
    (list?: Task[] | TodayItem[]) => withStart(list, id, iso),
    { revalidate: false },
  );
  try {
    await req(`${TASKS_KEY}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        scheduledStart: iso,
        completed: false,
        completedAt: null,
        ...(context ? { context } : {}),
      }),
    });
  } catch (err) {
    mutate(isItemCacheKey); // revert the optimistic move
    throw err;
  }
  mutate(isItemCacheKey);
}

export async function updateTask(
  id: string,
  patch: Partial<Task>,
  context?: TaskEventContext,
): Promise<void> {
  await req(`${TASKS_KEY}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ ...patch, ...(context ? { context } : {}) }),
  });
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

/** What /api/breakdown returns: LLM-proposed steps, or an empty manual start. */
export interface BreakdownResult {
  llmUsed: boolean;
  steps: string[];
  /** True when the LLM was configured but couldn't be reached/parsed. */
  unavailable?: boolean;
}

export async function generateBreakdown(taskId: string): Promise<BreakdownResult> {
  return req<BreakdownResult>("/api/breakdown", {
    method: "POST",
    body: JSON.stringify({ taskId }),
  });
}

/** What /api/suggest returns: the AI's gap pick, or "use the deterministic one". */
export interface SuggestResult {
  llmUsed: boolean;
  pickId?: string;
  reason?: string;
  runnerUpId?: string | null;
  runnerUpReason?: string | null;
}

export async function generateGapSuggestion(input: {
  gapStart: Date;
  gapEnd: Date;
  candidateIds: string[];
  /** The Day Battery percent, so the AI can favour lighter picks on full days. */
  dayLoadPercent?: number;
}): Promise<SuggestResult> {
  return req<SuggestResult>("/api/suggest", {
    method: "POST",
    body: JSON.stringify({
      gapStart: input.gapStart.toISOString(),
      gapEnd: input.gapEnd.toISOString(),
      candidateIds: input.candidateIds,
      tzOffsetMinutes: new Date().getTimezoneOffset(),
      ...(input.dayLoadPercent != null ? { dayLoadPercent: input.dayLoadPercent } : {}),
    }),
  });
}

/** Turn the approved steps into real to-dos and retire the parent task. */
export async function acceptBreakdown(
  taskId: string,
  steps: string[],
  meta: { llmUsed: boolean; edited: boolean },
): Promise<Task[]> {
  const res = await req<{ steps: Task[] }>("/api/breakdown/accept", {
    method: "POST",
    body: JSON.stringify({ taskId, steps, ...meta }),
  });
  mutate(isItemCacheKey);
  return res.steps;
}

/**
 * Fire-and-forget client-side observation for the event log (whitelisted
 * types only). Never awaited by UI code and never allowed to throw.
 */
export function logClientEvent(
  type: ClientEventType,
  taskId?: string,
  payload?: Record<string, unknown>,
): void {
  fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, taskId, payload }),
  }).catch(() => {});
}
