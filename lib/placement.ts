import { addMinutes, minutesBetween, startOfDay } from "./dates";

/**
 * Pure drag-placement math, shared by the Timeline's block drag and the
 * DayPlacer scheduling bar. All positions are integer minutes from the start
 * of the day window, so overlap / snap logic stays simple and testable.
 */

export const STEP_MIN = 5; // quantize a dragged start to 5-minute marks
export const SNAP_MIN = 9; // magnet range: snap flush to a neighbour / window edge within this
export const COARSE_STEP_MIN = 15; // quantize step on low-density (narrow) tracks
export const FINE_PX_PER_MIN = 0.75; // below this px/min, drags use COARSE_STEP_MIN

export interface Span {
  id: string;
  startMin: number;
  endMin: number;
}

export interface Placement {
  /** Resolved start (quantized / snapped / clamped). */
  startMin: number;
  /** The spot overlaps another span — can't drop here. */
  conflict: boolean;
  /** Ids of the spans the proposal overlaps. */
  overlapIds: string[];
  /** The magnet engaged (flush to a neighbour / edge) and the spot is free. */
  snapped: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** True when a span of `durationMin` starting at `s` overlaps none of `others`. */
function isFree(others: Span[], s: number, durationMin: number): boolean {
  return !others.some((o) => s < o.endMin && o.startMin < s + durationMin);
}

/**
 * Resolve a raw dragged start into a placed one: quantize to `stepMin` marks,
 * then magnet-snap flush to a neighbour's edge or a window edge if that lands
 * within `snapMin` and the spot is free. `minStartMin` is a hard floor (e.g.
 * "not in the past" for scheduling flows); like the window-end clamp, it may
 * hold the result off-grid at the boundary.
 */
export function resolvePlacement(opts: {
  /** Spans EXCLUDING the one being moved — caller filters out its own id. */
  others: Span[];
  windowMinutes: number;
  durationMin: number;
  rawStartMin: number;
  stepMin?: number;
  snapMin?: number;
  minStartMin?: number;
}): Placement {
  const { others, windowMinutes, durationMin, rawStartMin } = opts;
  const step = opts.stepMin ?? STEP_MIN;
  const snap = opts.snapMin ?? SNAP_MIN;
  const minStart = opts.minStartMin ?? 0;
  const maxStart = Math.max(0, windowMinutes - durationMin);

  // The window can't legally hold the span at all (e.g. today is nearly over):
  // pin to the end and report a conflict so it can never be committed.
  if (minStart > maxStart) {
    return { startMin: maxStart, conflict: true, overlapIds: [], snapped: false };
  }

  let start = clamp(Math.round(rawStartMin / step) * step, minStart, maxStart);

  // Magnet: prefer a nearby flush position (right after / right before a span,
  // or hard against a window edge) when it's within range and actually free.
  const candidates = [minStart, maxStart];
  for (const o of others) candidates.push(o.endMin, o.startMin - durationMin);
  let best: number | null = null;
  let bestDist = snap + 0.5;
  for (const c of candidates) {
    const cc = clamp(c, minStart, maxStart);
    const dist = Math.abs(cc - start);
    if (dist <= bestDist && isFree(others, cc, durationMin)) {
      best = cc;
      bestDist = dist;
    }
  }
  let snapped = false;
  if (best != null) {
    start = best;
    snapped = true;
  }

  const overlapIds = others
    .filter((o) => start < o.endMin && o.startMin < start + durationMin)
    .map((o) => o.id);
  return {
    startMin: start,
    conflict: overlapIds.length > 0,
    overlapIds,
    snapped: snapped && overlapIds.length === 0,
  };
}

/**
 * Earliest start where the span fits, walking the day like findFreeSlots:
 * on a blocker, resume the moment it ends — an off-grid flush gap is a real
 * opening. `preferredMin` is returned as-is when it's free and in range.
 */
export function firstFreeStartMin(opts: {
  others: Span[];
  windowMinutes: number;
  durationMin: number;
  minStartMin?: number;
  stepMin?: number;
  preferredMin?: number;
}): number | null {
  const { others, windowMinutes, durationMin } = opts;
  const step = opts.stepMin ?? STEP_MIN;
  const minStart = opts.minStartMin ?? 0;
  const maxStart = windowMinutes - durationMin;
  if (maxStart < minStart) return null;

  const pref = opts.preferredMin;
  if (pref != null && pref >= minStart && pref <= maxStart && isFree(others, pref, durationMin)) {
    return pref;
  }

  let cursor = Math.ceil(minStart / step) * step;
  while (cursor <= maxStart) {
    const blocker = others.find((o) => cursor < o.endMin && o.startMin < cursor + durationMin);
    if (!blocker) return cursor;
    cursor = blocker.endMin;
  }
  return null;
}

/**
 * Up to three free starts spread across the day — the earliest opening in the
 * morning (before 12:00), afternoon (before 17:00), and evening buckets.
 * `windowStartMinOfDay` = the window start as minutes from midnight, so the
 * clock-time bucket edges can be mapped into window minutes.
 */
export function suggestStartsMin(opts: {
  others: Span[];
  windowMinutes: number;
  durationMin: number;
  windowStartMinOfDay: number;
  minStartMin?: number;
  stepMin?: number;
}): number[] {
  const { others, windowMinutes, durationMin, windowStartMinOfDay } = opts;
  const step = opts.stepMin ?? STEP_MIN;
  const minStart = opts.minStartMin ?? 0;
  const maxStart = windowMinutes - durationMin;
  if (maxStart < minStart) return [];

  const edges = [0, 12 * 60 - windowStartMinOfDay, 17 * 60 - windowStartMinOfDay, windowMinutes];
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    const lo = Math.max(edges[i], minStart);
    const hi = Math.max(edges[i + 1], lo);
    let cursor = Math.ceil(lo / step) * step;
    while (cursor <= maxStart && cursor < hi) {
      const blocker = others.find((o) => cursor < o.endMin && o.startMin < cursor + durationMin);
      if (!blocker) {
        if (!out.includes(cursor)) out.push(cursor);
        break;
      }
      cursor = blocker.endMin;
    }
  }
  return out;
}

export interface HourMark {
  date: Date;
  pct: number;
  major: boolean;
}

/** Every hour mark inside the window; `major` ones get a numbered label. */
export function hourMarks(windowStart: Date, windowEnd: Date, windowMinutes: number): HourMark[] {
  if (windowMinutes <= 0) return [];
  const windowHours = windowMinutes / 60;
  const labelEvery = Math.max(1, Math.ceil(windowHours / 5)); // ~5 labels max
  const marks: HourMark[] = [];
  let m = startOfDay(windowStart);
  while (m < windowStart) m = addMinutes(m, 60);
  let i = 0;
  while (m <= windowEnd) {
    const pct = (minutesBetween(windowStart, m) / windowMinutes) * 100;
    marks.push({ date: m, pct, major: i % labelEvery === 0 });
    m = addMinutes(m, 60);
    i += 1;
  }
  return marks;
}

/** Drag quantize step for a track's pixel density: 5 min normally, 15 when too dense to grab. */
export function stepForDensity(pxPerMinute: number): number {
  return pxPerMinute < FINE_PX_PER_MIN ? COARSE_STEP_MIN : STEP_MIN;
}
