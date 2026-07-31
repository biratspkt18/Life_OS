import { tasks } from "./db/schema";
import type { CalendarEvent } from "./calendar";
import type { Energy, Importance, TodayItem } from "../types";

/**
 * The single place a database task row (or a Google Calendar event) becomes a
 * `TodayItem` for the UI. Previously duplicated verbatim in `today.ts` and
 * `range.ts`; kept here so the day view and the month view can never drift
 * (a new Task field surfaces in both, or neither).
 */

type Row = typeof tasks.$inferSelect;

/** Minutes between two ISO instants, or null when either is missing/degenerate. */
export function diffMinutes(startISO: string | null, endISO: string | null): number | null {
  if (!startISO || !endISO) return null;
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  return ms > 0 ? Math.round(ms / 60000) : null;
}

/** A Life OS task row → a Today item. */
export function taskToItem(t: Row): TodayItem {
  return {
    id: t.id,
    title: t.title,
    start: t.scheduledStart,
    durationMinutes: t.durationMinutes,
    importance: t.importance as Importance,
    completed: t.completed,
    allDay: false,
    source: "lifeos",
    energy: (t.energy as Energy | null) ?? null,
  };
}

/** A Google Calendar event (not created here) → a read-only Today item. */
export function googleEventToItem(e: CalendarEvent): TodayItem {
  return {
    id: `g:${e.id}`,
    title: e.title,
    start: e.start,
    durationMinutes: diffMinutes(e.start, e.end),
    importance: null,
    completed: false,
    allDay: e.allDay,
    source: "google",
    energy: null,
  };
}

/** Chronological sort for the merged list (undated items sort first). */
export function byStart(a: TodayItem, b: TodayItem): number {
  const as = a.start ? new Date(a.start).getTime() : 0;
  const bs = b.start ? new Date(b.start).getTime() : 0;
  return as - bs;
}
