import type { Importance } from "../types";
import type { NewTaskInput } from "./tasks";
import type { TaskPatch } from "./tasks";

/**
 * Runtime validation for API payloads. The route handlers used to cast
 * `req.json()` straight to typed shapes — TypeScript types are compile-time
 * only, so garbage (`durationMinutes: -60`, `dueDate: "banana"`) went straight
 * into SQLite and later crashed rendering (`RangeError: Invalid time value`).
 * Everything user-supplied passes through here first; on failure the routes
 * return 400 with the reason.
 */

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

const IMPORTANCES: readonly Importance[] = ["high", "normal", "low"];
const MIN_DURATION = 5; // matches the capture wheel's floor
const MAX_DURATION = 480; // …and its ceiling (8 hr)
const MAX_TITLE = 300;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** A parseable datetime → canonical ISO; null/undefined → null; else error. */
function isoOrNull(v: unknown, field: string): Validated<string | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== "string" || Number.isNaN(new Date(v).getTime())) {
    return fail(`${field} must be a valid ISO datetime or null`);
  }
  return { ok: true, value: new Date(v).toISOString() };
}

function title(v: unknown): Validated<string> {
  if (typeof v !== "string") return fail("title required");
  const t = v.trim();
  if (t.length === 0) return fail("title can't be empty");
  if (t.length > MAX_TITLE) return fail(`title too long (max ${MAX_TITLE} chars)`);
  return { ok: true, value: t };
}

function duration(v: unknown): Validated<number> {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < MIN_DURATION || n > MAX_DURATION) {
    return fail(`durationMinutes must be ${MIN_DURATION}–${MAX_DURATION}`);
  }
  return { ok: true, value: n };
}

function importance(v: unknown): Validated<Importance> {
  if (!IMPORTANCES.includes(v as Importance)) {
    return fail(`importance must be one of ${IMPORTANCES.join(", ")}`);
  }
  return { ok: true, value: v as Importance };
}

/** Validate a POST /api/tasks body into a clean NewTaskInput. */
export function parseNewTask(b: Record<string, unknown>): Validated<NewTaskInput> {
  const t = title(b.title);
  if (!t.ok) return t;
  const d = duration(b.durationMinutes ?? 30);
  if (!d.ok) return d;
  const imp = importance(b.importance ?? "normal");
  if (!imp.ok) return imp;
  const scheduledStart = isoOrNull(b.scheduledStart, "scheduledStart");
  if (!scheduledStart.ok) return scheduledStart;
  const dueDate = isoOrNull(b.dueDate, "dueDate");
  if (!dueDate.ok) return dueDate;
  const preferredDate = isoOrNull(b.preferredDate, "preferredDate");
  if (!preferredDate.ok) return preferredDate;
  return {
    ok: true,
    value: {
      title: t.value,
      durationMinutes: d.value,
      importance: imp.value,
      scheduledStart: scheduledStart.value,
      dueDate: dueDate.value,
      preferredDate: preferredDate.value,
    },
  };
}

/** Validate a PATCH /api/tasks/[id] body; unknown keys are dropped. */
export function parseTaskPatch(b: Record<string, unknown>): Validated<TaskPatch> {
  const patch: TaskPatch = {};

  if ("title" in b) {
    const t = title(b.title);
    if (!t.ok) return t;
    patch.title = t.value;
  }
  if ("durationMinutes" in b) {
    const d = duration(b.durationMinutes);
    if (!d.ok) return d;
    patch.durationMinutes = d.value;
  }
  if ("importance" in b) {
    const imp = importance(b.importance);
    if (!imp.ok) return imp;
    patch.importance = imp.value;
  }
  if ("completed" in b) {
    if (typeof b.completed !== "boolean") return fail("completed must be a boolean");
    patch.completed = b.completed;
  }
  for (const field of ["scheduledStart", "dueDate", "preferredDate", "completedAt"] as const) {
    if (field in b) {
      const v = isoOrNull(b[field], field);
      if (!v.ok) return v;
      patch[field] = v.value;
    }
  }

  if (Object.keys(patch).length === 0) return fail("no recognized fields to update");
  return { ok: true, value: patch };
}

/** Validate the start/end query params shared by /api/today and /api/range. */
export function parseRangeParams(
  start: string | null,
  end: string | null,
): Validated<{ start: string; end: string }> {
  if (!start || !end) return fail("start and end required");
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return fail("start and end must be valid ISO datetimes");
  }
  if (e <= s) return fail("end must be after start");
  return { ok: true, value: { start: s.toISOString(), end: e.toISOString() } };
}
