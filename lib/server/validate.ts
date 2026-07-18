import type { Energy, Importance, TaskEventContext } from "../types";
import { MAX_TAG_CHARS, normalizeTag } from "../tags";
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

const ENERGIES: readonly Energy[] = ["low", "medium", "high"];

/** Energy is optional: null/undefined clears it, otherwise it must be valid. */
function energy(v: unknown): Validated<Energy | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (!ENERGIES.includes(v as Energy)) {
    return fail(`energy must be one of ${ENERGIES.join(", ")} or null`);
  }
  return { ok: true, value: v as Energy };
}

/** Tag is optional: null/undefined clears it; a present string must normalize. */
function tag(v: unknown): Validated<string | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  const t = normalizeTag(v);
  if (t === null) return fail(`tag must be 1–${MAX_TAG_CHARS} characters`);
  return { ok: true, value: t };
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
  const tg = tag(b.tag);
  if (!tg.ok) return tg;
  const en = energy(b.energy);
  if (!en.ok) return en;
  return {
    ok: true,
    value: {
      title: t.value,
      durationMinutes: d.value,
      importance: imp.value,
      scheduledStart: scheduledStart.value,
      dueDate: dueDate.value,
      preferredDate: preferredDate.value,
      tag: tg.value,
      energy: en.value,
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
  if ("tag" in b) {
    const t = tag(b.tag);
    if (!t.ok) return t;
    patch.tag = t.value;
  }
  if ("energy" in b) {
    const en = energy(b.energy);
    if (!en.ok) return en;
    patch.energy = en.value;
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

/** Validate a POST /api/breakdown/accept body. */
export function parseBreakdownAccept(b: Record<string, unknown>): Validated<{
  taskId: string;
  steps: string[];
  llmUsed: boolean;
  edited: boolean;
}> {
  if (typeof b.taskId !== "string" || !b.taskId) return fail("taskId required");
  if (!Array.isArray(b.steps)) return fail("steps must be an array");
  const steps: string[] = [];
  for (const s of b.steps) {
    const t = title(s);
    if (!t.ok) return t;
    steps.push(t.value);
  }
  if (steps.length < 1) return fail("at least one step required");
  if (steps.length > 8) return fail("at most 8 steps");
  return {
    ok: true,
    value: {
      taskId: b.taskId,
      steps,
      llmUsed: b.llmUsed === true,
      edited: b.edited === true,
    },
  };
}

const CHOSEN_VIA = ["first_fit", "drag", "chip", "exact", "quick"] as const;

/**
 * Sanitize the optional telemetry `context` a mutation body may carry.
 * Context is observation, not data: unknown keys are dropped and garbage
 * yields `undefined` — it must never turn a valid write into a 400.
 */
export function parseEventContext(v: unknown): TaskEventContext | undefined {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return undefined;
  const b = v as Record<string, unknown>;
  const ctx: TaskEventContext = {};
  if (b.proposedStart === null) ctx.proposedStart = null;
  else if (typeof b.proposedStart === "string" && !Number.isNaN(new Date(b.proposedStart).getTime())) {
    ctx.proposedStart = new Date(b.proposedStart).toISOString();
  }
  if (CHOSEN_VIA.includes(b.chosenVia as (typeof CHOSEN_VIA)[number])) {
    ctx.chosenVia = b.chosenVia as TaskEventContext["chosenVia"];
  }
  const mins = Math.round(Number(b.freeMinutesDay));
  if (Number.isFinite(mins) && mins >= 0 && mins <= 1440) ctx.freeMinutesDay = mins;
  return Object.keys(ctx).length > 0 ? ctx : undefined;
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
