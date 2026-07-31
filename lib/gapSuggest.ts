import {
  IMPORTANCE_RANK,
  type DayWindow,
  type Energy,
  type Importance,
  type Task,
  type TodayItem,
} from "./types";
import { atTime, minutesBetween, type Interval } from "./dates";
import { computeFreeGaps } from "./schedule";
import { matchesLane, type EnergyLane } from "./energyLane";

/**
 * The "Got a little room?" pipeline, pure end to end: find the current open
 * gap in today's schedule, filter the to-dos / loose ends that genuinely fit
 * it, rank them deterministically, and (for the AI step) build the prompt and
 * harden the reply. No DB, no fetch, no React — the hook, the API route, and
 * the test script all import from here.
 *
 * The AI only ever re-orders and explains; every candidate it may pick was
 * chosen by this deterministic code first.
 */

/** The smallest opening we'll call "a little room" (same bar as before). */
export const MIN_GAP_MINUTES = 30;

/** Candidates sent to the AI — enough for a real choice, small enough to stay cheap. */
export const MAX_CANDIDATES = 12;

/** Suggested starts snap to a tidy 5-minute boundary. */
const START_STEP_MINUTES = 5;

/** Reasons longer than this are cut — the card wants one calm sentence. */
const MAX_REASON_CHARS = 240;

/** Below this many completions, a tag has no believable "usual finish hour". */
const MIN_TIME_SAMPLES = 3;

/**
 * One open gap. `start`/`end` are the *structural* boundaries — busy edge to
 * busy edge, ignoring the clock — so a gap keeps its identity (and its cached
 * suggestion) all the while you sit inside it. `usableStart`/`usableMinutes`
 * are what's actually left of it right now, and are what fit checks and
 * placement use: `usableStart` is never in the past and always inside free
 * time, so a task placed there can't collide with anything.
 */
export interface Gap {
  start: Date;
  end: Date;
  usableStart: Date;
  usableMinutes: number;
}

/** A task the AI is allowed to pick, flattened to what the ranking needs. */
export interface SuggestCandidate {
  id: string;
  title: string;
  tag: string | null;
  energy: Energy | null;
  durationMinutes: number;
  importance: Importance;
  dueDate: string | null;
  preferredDate: string | null;
  deferralCount: number;
  kind: "todo" | "loose-end";
}

/** The validated AI verdict. */
export interface SuggestPick {
  pickId: string;
  reason: string;
  runnerUpId: string | null;
  /** The runner-up's own one-liner, so "Something else" keeps an explanation. */
  runnerUpReason: string | null;
}

/** Per-tag history the AI reasons over. */
export interface TagHistoryStat {
  tag: string;
  /** 0..1 share of that tag's tasks that got completed. */
  completionRate: number;
  /** Median local clock hour (0–23) the tag's tasks get finished, or null. */
  typicalFinishHour: number | null;
  sampleSize: number;
}

/** Round up to the next tidy start boundary. */
function roundUpToStep(d: Date): Date {
  const step = START_STEP_MINUTES * 60_000;
  return new Date(Math.ceil(d.getTime() / step) * step);
}

/** Timed Today items (tasks + Google events) as busy intervals. */
function busyFromItems(items: TodayItem[], fallbackDurationMinutes: number): Interval[] {
  const busy: Interval[] = [];
  for (const item of items) {
    if (item.allDay || !item.start) continue;
    const start = new Date(item.start);
    const dur = item.durationMinutes ?? fallbackDurationMinutes;
    busy.push({ start, end: new Date(start.getTime() + dur * 60_000) });
  }
  return busy;
}

/**
 * The current open gap on `day`, or null when there isn't a usable one.
 * Structural gaps come from `computeFreeGaps` called with the window start as
 * its "now" — that disables its past-clipping, so boundaries only move when a
 * block is added, moved, or removed, never as the clock ticks.
 */
export function findCurrentGap(
  items: TodayItem[],
  window: DayWindow,
  day: Date,
  now: Date,
  fallbackDurationMinutes: number,
): Gap | null {
  if (!window.enabled) return null;
  const windowStart = atTime(day, window.dayWindowStart);
  const windowEnd = atTime(day, window.dayWindowEnd);
  if (now >= windowEnd) return null;

  const busy = busyFromItems(items, fallbackDurationMinutes);
  const gaps = computeFreeGaps(windowStart, windowEnd, busy, windowStart);

  for (const g of gaps) {
    if (now >= g.end) continue; // already behind us
    const usableStart = roundUpToStep(new Date(Math.max(now.getTime(), g.start.getTime())));
    const usableMinutes = minutesBetween(usableStart, g.end);
    if (usableMinutes >= MIN_GAP_MINUTES) {
      return { start: g.start, end: g.end, usableStart, usableMinutes };
    }
  }
  return null;
}

/** Stable identity for a gap — same all day unless its boundaries move. */
export function gapKey(gap: Gap): string {
  return `${gap.start.toISOString()}|${gap.end.toISOString()}`;
}

function toCandidate(t: Task, kind: "todo" | "loose-end"): SuggestCandidate {
  return {
    id: t.id,
    title: t.title,
    tag: t.tag,
    energy: t.energy,
    durationMinutes: t.durationMinutes,
    importance: t.importance,
    dueDate: t.dueDate,
    preferredDate: t.preferredDate,
    deferralCount: t.deferralCount,
    kind,
  };
}

/** Soonest of due / preferred date (Infinity when it has neither). */
function urgencyKey(c: SuggestCandidate): number {
  const due = c.dueDate ? new Date(c.dueDate).getTime() : Infinity;
  const pref = c.preferredDate ? new Date(c.preferredDate).getTime() : Infinity;
  return Math.min(due, pref);
}

/**
 * The deterministic order: urgency (due/preferred, soonest first), then
 * importance, then how often the task has slipped (a much-deferred task
 * deserves the nudge). Every candidate starts at the same `usableStart`, so
 * "soonest fit" is a tie by construction and urgency leads.
 */
export function rankDeterministic(candidates: SuggestCandidate[]): SuggestCandidate[] {
  return [...candidates].sort((a, b) => {
    // Both keys can be Infinity (no dates), where subtraction would give NaN.
    const ua = urgencyKey(a);
    const ub = urgencyKey(b);
    if (ua !== ub) return ua < ub ? -1 : 1;
    const byImportance = IMPORTANCE_RANK[b.importance] - IMPORTANCE_RANK[a.importance];
    if (byImportance !== 0) return byImportance;
    return b.deferralCount - a.deferralCount;
  });
}

/**
 * Everything allowed into the gap: loose ends and unscheduled to-dos that fit
 * the usable minutes, deduped (loose-end wins), minus the current spotlight.
 * An active energy lane narrows the pool (unlabeled tasks ride in every
 * lane) — applied *before* the cap so lane matches past rank 12 still count.
 * Returned already ranked and capped.
 */
export function buildCandidates(
  gap: Gap,
  todos: Task[],
  looseEnds: Task[],
  excludeId?: string,
  lane?: EnergyLane | null,
): SuggestCandidate[] {
  const byId = new Map<string, SuggestCandidate>();
  for (const t of looseEnds) {
    if (!byId.has(t.id)) byId.set(t.id, toCandidate(t, "loose-end"));
  }
  for (const t of todos) {
    if (!byId.has(t.id)) byId.set(t.id, toCandidate(t, "todo"));
  }

  const fitting = [...byId.values()].filter(
    (c) =>
      c.id !== excludeId &&
      c.durationMinutes <= gap.usableMinutes &&
      matchesLane(lane ?? null, c.energy),
  );
  // Belt and braces — both source lists already exclude completed tasks.
  const open = fitting.filter((c) => {
    const src = looseEnds.find((t) => t.id === c.id) ?? todos.find((t) => t.id === c.id);
    return src ? !src.completed : true;
  });

  return rankDeterministic(open).slice(0, MAX_CANDIDATES);
}

/** A UTC instant shown on the user's clock, as "HH:mm". */
export function formatLocalHHmm(date: Date, tzOffsetMinutes: number): string {
  const local = new Date(date.getTime() - tzOffsetMinutes * 60_000);
  const h = String(local.getUTCHours()).padStart(2, "0");
  const m = String(local.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Per-tag history for the prompt: how reliably a tag's tasks get done, and the
 * median local hour they get finished (from `completedAt`, shifted by the
 * client's timezone offset — the server's own clock is never trusted).
 */
export function computeTagTimeStats(tasks: Task[], tzOffsetMinutes: number): TagHistoryStat[] {
  const perTag = new Map<string, { total: number; completed: number; hours: number[] }>();
  for (const t of tasks) {
    if (!t.tag) continue;
    let s = perTag.get(t.tag);
    if (!s) {
      s = { total: 0, completed: 0, hours: [] };
      perTag.set(t.tag, s);
    }
    s.total++;
    if (t.completed) s.completed++;
    if (t.completedAt) {
      const local = new Date(new Date(t.completedAt).getTime() - tzOffsetMinutes * 60_000);
      s.hours.push(local.getUTCHours());
    }
  }

  const out: TagHistoryStat[] = [];
  for (const [tag, s] of perTag) {
    const sorted = [...s.hours].sort((a, b) => a - b);
    const typicalFinishHour =
      sorted.length >= MIN_TIME_SAMPLES ? sorted[Math.floor(sorted.length / 2)] : null;
    out.push({
      tag,
      completionRate: s.total > 0 ? Math.round((s.completed / s.total) * 100) / 100 : 0,
      typicalFinishHour,
      sampleSize: sorted.length,
    });
  }
  return out;
}

/** The compact context pack the prompt embeds — all times in the user's clock. */
export interface SuggestContext {
  now: string; // "HH:mm"
  gap: { start: string; end: string; minutes: number };
  /**
   * How heavy the day already is — the Day Battery percent (100% = a
   * comfortably full day; over 100 = overloaded). Lets the AI lean toward
   * lighter picks when the day is already packed. Optional: absent when the
   * client didn't send it (older clients / degraded path).
   */
  dayLoadPercent?: number;
  candidates: {
    id: string;
    title: string;
    tag: string | null;
    energy: Energy | null;
    minutes: number;
    importance: Importance;
    due: string | null; // "yyyy-MM-dd"
    preferred: string | null;
    timesRescheduled: number;
  }[];
  tagHistory: TagHistoryStat[];
}

/** A calm phrase for the day's load, so the prompt reads naturally. */
function dayLoadPhrase(percent: number): string {
  if (percent > 100) return `already overloaded (about ${percent}% of a full day)`;
  if (percent >= 80) return `already quite full (about ${percent}% of a full day)`;
  if (percent >= 50) return `moderately full (about ${percent}% of a full day)`;
  return `still light (about ${percent}% of a full day)`;
}

export function buildSuggestPrompt(ctx: SuggestContext): string {
  return `You help a neurodivergent user gently fill a free gap in their day.
Given the gap and the candidate tasks below (all of them fit the gap), pick
the ONE task best suited to this moment, and a different task as runner-up.

Consider:
- a comfortable fit in the remaining minutes (room to breathe beats cramming),
- due dates coming up,
- tasks rescheduled many times (they need a low-friction win),
- the user's patterns per tag: completionRate is how reliably that tag gets
  done, typicalFinishHour is the local hour (0-23) it usually gets finished —
  match the task's energy and tag to the time of day when it helps.${
    ctx.dayLoadPercent != null
      ? `
- how full the day already is: the day is ${dayLoadPhrase(ctx.dayLoadPercent)}.
  When it's already full, lean toward a lighter (low-energy or short) pick;
  when it's still light, a heavier task is fine. Never guilt-trip about it.`
      : ""
  }

Rules:
- "reason" is ONE calm, specific sentence about the picked task. Encouraging,
  never pressuring. No exclamation marks.
- "runnerUpReason" is the same kind of single sentence about the runner-up.
- "pickId" and "runnerUpId" must be ids from the candidates. Use null for
  "runnerUpId" and "runnerUpReason" only if there is a single candidate.
- Return ONLY JSON:
  {"pickId": "...", "reason": "...", "runnerUpId": "...", "runnerUpReason": "..."}

Context:
${JSON.stringify(ctx)}`;
}

/**
 * Harden the LLM reply into a usable pick. Tolerates code fences and stray
 * prose; returns null (→ deterministic fallback) when the pick is missing,
 * unknown, or unexplained. A bad runner-up degrades to null on its own — it
 * never costs the user a good pick.
 */
export function parseSuggestResponse(raw: string, candidateIds: string[]): SuggestPick | null {
  let text = raw.replace(/```(?:json)?/gi, "");
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  text = text.slice(first, last + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  const pickId = obj.pickId;
  if (typeof pickId !== "string" || !candidateIds.includes(pickId)) return null;

  const reason = typeof obj.reason === "string" ? obj.reason.trim() : "";
  if (!reason) return null;

  const runnerUpId =
    typeof obj.runnerUpId === "string" &&
    obj.runnerUpId !== pickId &&
    candidateIds.includes(obj.runnerUpId)
      ? obj.runnerUpId
      : null;
  const runnerUpReason =
    runnerUpId && typeof obj.runnerUpReason === "string" && obj.runnerUpReason.trim()
      ? clip(obj.runnerUpReason.trim())
      : null;

  return { pickId, reason: clip(reason), runnerUpId, runnerUpReason };
}

function clip(s: string): string {
  return s.length > MAX_REASON_CHARS ? `${s.slice(0, MAX_REASON_CHARS)}…` : s;
}
