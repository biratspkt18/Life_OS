import type { DayWindow, TodayItem } from "./types";
import { atTime, startOfDay, type Interval } from "./dates";

/** A timed block positioned along the rendered bar, for the timeline. */
export interface Block {
  item: TodayItem;
  start: Date;
  end: Date;
  /** % offset from the bar's start (0–100). The bar is horizontal, so this is
   *  a *left* offset. Bar = window unless extended. */
  startPct: number;
  /** % of the bar's length — the block's *width* (clamped to the strip). */
  lengthPct: number;
}

/** One span of the capacity bar — either booked or free. */
export interface BarSegment {
  kind: "busy" | "free";
  widthPct: number;
}

/** Everything the three overviews need to render a day's shape. */
export interface DayShape {
  enabled: boolean;
  windowStart: Date;
  windowEnd: Date;
  windowMinutes: number;
  /**
   * The rendered track's span. Equals the window unless `extendToNow`
   * stretched it to include an outside-hours "now" (early morning / late
   * evening). All block/pointer percentages are relative to the bar.
   */
  barStart: Date;
  barEnd: Date;
  barMinutes: number;
  /** True when the bar reaches outside the working window on that side. */
  extendedBefore: boolean;
  extendedAfter: boolean;
  blocks: Block[];
  allDay: TodayItem[];
  bookedMinutes: number;
  freeMinutes: number;
  /** Free minutes from max(now, windowStart) to windowEnd — for loose-end gating. */
  remainingFreeMinutes: number;
  segments: BarSegment[];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Local clock start-of-hour (constructor normalizes, so DST is handled). */
function floorToHour(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);
}

/** Local clock end-of-hour: the next :00, or `d` itself if already on the hour. */
function ceilToHour(d: Date): Date {
  const onHour = d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + (onHour ? 0 : 1), 0, 0, 0);
}

/** Sort by start, then merge any overlapping/touching intervals. */
function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) {
      if (iv.end > last.end) last.end = iv.end;
    } else {
      merged.push({ start: new Date(iv.start), end: new Date(iv.end) });
    }
  }
  return merged;
}

/** Minutes of `merged` (already merged) that fall within [rangeStart, rangeEnd]. */
function coverageWithin(merged: Interval[], rangeStart: Date, rangeEnd: Date): number {
  let mins = 0;
  for (const iv of merged) {
    const s = Math.max(iv.start.getTime(), rangeStart.getTime());
    const e = Math.min(iv.end.getTime(), rangeEnd.getTime());
    if (e > s) mins += (e - s) / 60000;
  }
  return Math.round(mins);
}

/**
 * Compute the visual shape of a day from its merged items and the working
 * window. Pure and deterministic — drives the capacity bar, the timeline, and
 * the summary line, plus loose-end gating (remaining free time).
 *
 * @param fallbackDuration minutes to assume for a timed item with no duration
 *   (e.g. a zero-length Google event), for display only.
 */
export function buildDayShape(
  items: TodayItem[],
  window: DayWindow,
  day: Date,
  now: Date,
  fallbackDuration: number,
  opts?: {
    /**
     * Stretch the rendered bar to include an outside-hours "now" (Today
     * only): before the window it reaches back to the current hour; after it,
     * forward past now — so the screen is never dead outside working hours
     * and tasks can be hand-placed there.
     */
    extendToNow?: boolean;
  },
): DayShape {
  const windowStart = atTime(day, window.dayWindowStart);
  const windowEnd = atTime(day, window.dayWindowEnd);
  const windowMinutes = Math.max(0, Math.round((windowEnd.getTime() - windowStart.getTime()) / 60000));

  // The rendered bar: the window, stretched to cover an outside-hours "now".
  // Hour edges are computed in *local clock* time (not epoch), so they land on
  // the real :00 mark even in half-hour-offset zones (e.g. UTC+9:30).
  const dayStart = startOfDay(day);
  const dayEndCap = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);
  let barStart = windowStart;
  let barEnd = windowEnd;
  if (opts?.extendToNow && windowMinutes > 0) {
    if (now < windowStart) {
      const flooredNow = floorToHour(now);
      barStart = flooredNow > dayStart ? flooredNow : dayStart;
    } else if (now > windowEnd) {
      // At least an hour of droppable room after now, on a tidy hour edge.
      const ceiled = ceilToHour(new Date(now.getTime() + 60 * 60_000));
      barEnd = ceiled < dayEndCap ? ceiled : dayEndCap;
    }
  }
  const barMinutes = Math.max(0, Math.round((barEnd.getTime() - barStart.getTime()) / 60000));
  const extendedBefore = barStart < windowStart;
  const extendedAfter = barEnd > windowEnd;

  const allDay = items.filter((i) => i.allDay);

  // Timed items become positioned blocks (bar-relative); skip anything with
  // no start. When the bar equals the window these numbers are unchanged.
  const timed = items.filter((i) => !i.allDay && i.start);
  const blocks: Block[] = timed.map((item) => {
    const start = new Date(item.start!);
    const dur = item.durationMinutes ?? fallbackDuration;
    const end = new Date(start.getTime() + dur * 60000);
    const fromStart = (start.getTime() - barStart.getTime()) / 60000;
    const startPct = barMinutes > 0 ? clamp((fromStart / barMinutes) * 100, 0, 100) : 0;
    const rawLength = barMinutes > 0 ? (dur / barMinutes) * 100 : 0;
    const lengthPct = clamp(rawLength, 0, 100 - startPct);
    return { item, start, end, startPct, lengthPct };
  });

  const busy = mergeIntervals(
    blocks.map((b) => ({
      start: b.start < windowStart ? windowStart : b.start,
      end: b.end > windowEnd ? windowEnd : b.end,
    })).filter((iv) => iv.end > iv.start),
  );

  const bookedMinutes = coverageWithin(busy, windowStart, windowEnd);
  const freeMinutes = Math.max(0, windowMinutes - bookedMinutes);

  const remainingStart = new Date(Math.min(windowEnd.getTime(), Math.max(now.getTime(), windowStart.getTime())));
  const remainingMinutes = Math.max(0, Math.round((windowEnd.getTime() - remainingStart.getTime()) / 60000));
  const remainingFreeMinutes = Math.max(0, remainingMinutes - coverageWithin(busy, remainingStart, windowEnd));

  // Walk the window left to right, alternating free gaps and busy spans.
  const segments: BarSegment[] = [];
  if (windowMinutes > 0) {
    const pct = (a: Date, b: Date) => ((b.getTime() - a.getTime()) / 60000 / windowMinutes) * 100;
    let cursor = windowStart;
    for (const iv of busy) {
      if (iv.start > cursor) segments.push({ kind: "free", widthPct: pct(cursor, iv.start) });
      segments.push({ kind: "busy", widthPct: pct(iv.start, iv.end) });
      cursor = iv.end;
    }
    if (cursor < windowEnd) segments.push({ kind: "free", widthPct: pct(cursor, windowEnd) });
  }

  return {
    enabled: window.enabled,
    windowStart,
    windowEnd,
    windowMinutes,
    barStart,
    barEnd,
    barMinutes,
    extendedBefore,
    extendedAfter,
    blocks,
    allDay,
    bookedMinutes,
    freeMinutes,
    remainingFreeMinutes,
    segments,
  };
}

/** The Now / Next / Later grouping of a day's timed items, shared by the feed. */
export interface DayGroups {
  /** Current in-progress block, else the next upcoming one. */
  spotlight: TodayItem | null;
  /** Every upcoming block after the spotlight, in time order. */
  upcoming: TodayItem[];
  allDay: TodayItem[];
  doneCount: number;
  toGoCount: number;
}

export function groupDay(items: TodayItem[], now: Date): DayGroups {
  const allDay = items.filter((i) => i.allDay);
  const timed = items.filter((i) => !i.allDay && i.start);
  const live = timed.filter((i) => !i.completed);

  const current = live.find((t) => {
    const s = new Date(t.start!);
    const end = t.durationMinutes != null ? new Date(s.getTime() + t.durationMinutes * 60000) : null;
    return end ? s <= now && now < end : false;
  });

  const upcoming = live
    .filter((t) => new Date(t.start!) >= now)
    .sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime());

  const spotlight = current ?? upcoming[0] ?? null;
  const rest = upcoming.filter((t) => t.id !== spotlight?.id);

  return {
    spotlight,
    upcoming: rest,
    allDay,
    doneCount: timed.filter((t) => t.completed && t.source === "lifeos").length,
    toGoCount: live.filter((t) => t.source === "lifeos").length,
  };
}

/** Compact "1h 30m" / "45m" / "2h" duration, for booked/free labels. */
export function compactDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
