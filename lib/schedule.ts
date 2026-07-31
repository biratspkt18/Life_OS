import {
  IMPORTANCE_RANK,
  windowForDay,
  type Importance,
  type Settings,
  type Task,
} from "./types";
import {
  addDays,
  atTime,
  endOf,
  type Interval,
  minutesBetween,
  overlaps,
  startOfDay,
} from "./dates";
import { applyWindowException, dayKeyOf, type WindowException } from "./effectiveWindow";

/**
 * The scheduling brain (brief §6).
 *
 * It only ever PROPOSES. Nothing here writes to the DB or a calendar; callers
 * take a proposal and show it to the user, who confirms or nudges.
 */

/** How many days ahead we'll search for a slot before giving up. */
const SEARCH_HORIZON_DAYS = 30;

export interface Bump {
  /** The lower-importance task we propose moving out of prime. */
  task: Task;
  /** Where we propose moving it to. */
  newStart: Date;
}

export interface SlotProposal {
  /** Where the (new/rescheduled) task should start. */
  start: Date;
  /** Present when prime was full and we had to make room. User confirms. */
  bump?: Bump;
}

export interface ProposalInput {
  durationMinutes: number;
  importance: Importance;
  settings: Settings;
  /** All tasks (used to derive busy time from scheduled, incomplete blocks). */
  tasks: Task[];
  /** Existing external busy intervals (e.g. Google events). Empty for now. */
  externalBusy?: Interval[];
  /** Exclude this task id from busy time (when re-homing an existing task). */
  excludeTaskId?: string;
  /** "Now" — injected for testability; defaults to current time. */
  now?: Date;
  /** Earliest day to consider placing on. Defaults to today. */
  earliestDay?: Date;
  /**
   * A one-day window change ("started early today"). Applied only to the
   * calendar day it names — never to the same weekday later in the horizon.
   */
  windowException?: WindowException | null;
}

/** The window a given day runs on, with any one-day exception applied. */
function windowOn(
  settings: Settings,
  day: Date,
  exception: WindowException | null | undefined,
) {
  return applyWindowException(windowForDay(settings, day), exception ?? null, dayKeyOf(day));
}

/** A scheduled task as a busy interval (done or not — it still holds the time). */
function taskInterval(t: Task): Interval | null {
  if (!t.scheduledStart) return null;
  const start = new Date(t.scheduledStart);
  return { start, end: endOf(start, t.durationMinutes) };
}

/** Busy intervals on a given day, sorted by start. */
function busyOnDay(
  day: Date,
  tasks: Task[],
  externalBusy: Interval[],
  excludeTaskId?: string,
): Interval[] {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const all: Interval[] = [];
  for (const t of tasks) {
    if (t.id === excludeTaskId) continue;
    const iv = taskInterval(t);
    if (iv && iv.start < dayEnd && iv.end > dayStart) all.push(iv);
  }
  for (const iv of externalBusy) {
    if (iv.start < dayEnd && iv.end > dayStart) all.push(iv);
  }
  return all.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Free gaps within [windowStart, windowEnd], minus busy intervals.
 * On today, the window can't start before `now` (can't schedule in the past).
 */
export function computeFreeGaps(
  windowStart: Date,
  windowEnd: Date,
  busy: Interval[],
  now: Date,
): Interval[] {
  let cursor = new Date(Math.max(windowStart.getTime(), now.getTime()));
  if (cursor >= windowEnd) return [];

  const gaps: Interval[] = [];
  // Only busy that intersects the working window matters.
  const relevant = busy
    .filter((b) => b.end > cursor && b.start < windowEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  for (const b of relevant) {
    if (b.start > cursor) {
      gaps.push({ start: new Date(cursor), end: new Date(Math.min(b.start.getTime(), windowEnd.getTime())) });
    }
    if (b.end > cursor) cursor = new Date(b.end);
    if (cursor >= windowEnd) break;
  }
  if (cursor < windowEnd) gaps.push({ start: new Date(cursor), end: new Date(windowEnd) });

  return gaps.filter((g) => g.end > g.start);
}

/** Earliest start within `gaps` that (a) fits duration and (b) lies in [lo,hi]. */
function earliestFit(
  gaps: Interval[],
  durationMinutes: number,
  bound?: Interval,
): Date | null {
  for (const g of gaps) {
    const lo = bound ? new Date(Math.max(g.start.getTime(), bound.start.getTime())) : g.start;
    const hi = bound ? new Date(Math.min(g.end.getTime(), bound.end.getTime())) : g.end;
    if (hi <= lo) continue;
    if (minutesBetween(lo, hi) >= durationMinutes) return lo;
  }
  return null;
}

/** Earliest non-prime fit on a day (for relocating a bumped task). */
function earliestNonPrimeFit(
  day: Date,
  durationMinutes: number,
  settings: Settings,
  busy: Interval[],
  now: Date,
  exception: WindowException | null | undefined,
): Date | null {
  const w = windowOn(settings, day, exception);
  if (!w.enabled) return null;
  const windowStart = atTime(day, w.dayWindowStart);
  const windowEnd = atTime(day, w.dayWindowEnd);
  const prime: Interval = {
    start: atTime(day, w.primeStart),
    end: atTime(day, w.primeEnd),
  };
  const gaps = computeFreeGaps(windowStart, windowEnd, busy, now);
  const nonPrime = gaps.filter((g) => !overlaps(g, prime));
  // Also consider the parts of gaps that fall before/after prime.
  const trimmed: Interval[] = [];
  for (const g of gaps) {
    if (!overlaps(g, prime)) {
      trimmed.push(g);
      continue;
    }
    if (g.start < prime.start) trimmed.push({ start: g.start, end: prime.start });
    if (g.end > prime.end) trimmed.push({ start: prime.end, end: g.end });
  }
  void nonPrime;
  return earliestFit(trimmed, durationMinutes);
}

/**
 * Propose a slot for a task (brief §6). Returns null only if nothing fits
 * within the search horizon (effectively never for a personal calendar).
 */
export function proposeSlot(input: ProposalInput): SlotProposal | null {
  const {
    durationMinutes,
    importance,
    settings,
    tasks,
    externalBusy = [],
    excludeTaskId,
  } = input;
  const now = input.now ?? new Date();
  const startDay = startOfDay(input.earliestDay ?? now);

  for (let i = 0; i < SEARCH_HORIZON_DAYS; i++) {
    const day = addDays(startDay, i);
    const w = windowOn(settings, day, input.windowException);
    if (!w.enabled) continue; // day off — schedule nothing here
    const windowStart = atTime(day, w.dayWindowStart);
    const windowEnd = atTime(day, w.dayWindowEnd);
    const prime: Interval = {
      start: atTime(day, w.primeStart),
      end: atTime(day, w.primeEnd),
    };
    const busy = busyOnDay(day, tasks, externalBusy, excludeTaskId);
    const gaps = computeFreeGaps(windowStart, windowEnd, busy, now);
    if (gaps.length === 0) continue;

    if (importance === "high") {
      // 1) Earliest free gap inside the prime block.
      const inPrime = earliestFit(gaps, durationMinutes, prime);
      if (inPrime) return { start: inPrime };

      // 2) Prime is full. Try to make room by bumping the lowest-importance
      //    task occupying prime that is strictly lower importance than this.
      const bump = tryBump(day, durationMinutes, importance, settings, tasks, externalBusy, excludeTaskId, now, input.windowException);
      if (bump) return bump;

      // 3) No room and no bump → try next day's prime (loop continues).
      continue;
    }

    // normal / low → earliest gap OUTSIDE prime; spill into prime only if
    // there's genuinely nowhere else that day.
    const outside = earliestNonPrimeFitFromGaps(gaps, durationMinutes, prime);
    if (outside) return { start: outside };

    const anywhere = earliestFit(gaps, durationMinutes);
    if (anywhere) return { start: anywhere }; // spill into prime (last resort)
  }

  return null;
}

/** Earliest fit from already-computed gaps that does not start inside prime. */
function earliestNonPrimeFitFromGaps(
  gaps: Interval[],
  durationMinutes: number,
  prime: Interval,
): Date | null {
  const trimmed: Interval[] = [];
  for (const g of gaps) {
    if (!overlaps(g, prime)) {
      trimmed.push(g);
      continue;
    }
    if (g.start < prime.start) trimmed.push({ start: g.start, end: prime.start });
    if (g.end > prime.end) trimmed.push({ start: prime.end, end: g.end });
  }
  return earliestFit(trimmed, durationMinutes);
}

/**
 * Attempt to free a prime slot for a high-importance task by moving out the
 * lowest-importance prime occupant that is strictly lower importance, and
 * relocating it to a non-prime gap. Returns a proposal with that bump, or null.
 */
function tryBump(
  day: Date,
  durationMinutes: number,
  newImportance: Importance,
  settings: Settings,
  tasks: Task[],
  externalBusy: Interval[],
  excludeTaskId: string | undefined,
  now: Date,
  exception: WindowException | null | undefined,
): SlotProposal | null {
  const w = windowOn(settings, day, exception);
  const prime: Interval = {
    start: atTime(day, w.primeStart),
    end: atTime(day, w.primeEnd),
  };
  const newRank = IMPORTANCE_RANK[newImportance];

  // Candidate occupants: incomplete Life OS tasks scheduled inside prime on
  // this day, strictly lower importance, sorted lowest-importance-first.
  const occupants = tasks
    .filter((t) => {
      if (t.id === excludeTaskId || t.completed || !t.scheduledStart) return false;
      if (IMPORTANCE_RANK[t.importance] >= newRank) return false;
      const iv = taskInterval(t);
      return iv ? overlaps(iv, prime) : false;
    })
    .sort((a, b) => IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance]);

  for (const occupant of occupants) {
    // Pretend the occupant is gone; does the new task now fit in prime?
    const busyWithout = busyOnDay(day, tasks, externalBusy, excludeTaskId).filter(
      (iv) => !sameAsTask(iv, occupant),
    );
    const gapsWithout = computeFreeGaps(
      atTime(day, w.dayWindowStart),
      atTime(day, w.dayWindowEnd),
      busyWithout,
      now,
    );
    const fitsPrime = earliestFit(gapsWithout, durationMinutes, prime);
    if (!fitsPrime) continue;

    // Find somewhere to move the occupant — earliest non-prime gap, today
    // forward, with the occupant itself excluded from busy.
    const tasksMinusOccupant = tasks.filter((t) => t.id !== occupant.id);
    let relocate: Date | null = null;
    for (let j = 0; j < SEARCH_HORIZON_DAYS && !relocate; j++) {
      const d = addDays(startOfDay(now), j);
      const busyD = busyOnDay(d, tasksMinusOccupant, externalBusy, excludeTaskId);
      relocate = earliestNonPrimeFit(d, occupant.durationMinutes, settings, busyD, now, exception);
    }
    if (!relocate) continue;

    return { start: fitsPrime, bump: { task: occupant, newStart: relocate } };
  }

  return null;
}

function sameAsTask(iv: Interval, t: Task): boolean {
  const ti = taskInterval(t);
  return !!ti && ti.start.getTime() === iv.start.getTime() && ti.end.getTime() === iv.end.getTime();
}
