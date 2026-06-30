import { db } from "./db";
import { tasks } from "./db/schema";
import { listEvents, type CalendarEvent } from "./calendar";
import type { Importance, TodayItem } from "../types";

type Row = typeof tasks.$inferSelect;

function diffMinutes(startISO: string | null, endISO: string | null): number | null {
  if (!startISO || !endISO) return null;
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  return ms > 0 ? Math.round(ms / 60000) : null;
}

function taskToItem(t: Row): TodayItem {
  return {
    id: t.id,
    title: t.title,
    start: t.scheduledStart,
    durationMinutes: t.durationMinutes,
    importance: t.importance as Importance,
    completed: t.completed,
    allDay: false,
    source: "lifeos",
  };
}

function byStart(a: TodayItem, b: TodayItem): number {
  const as = a.start ? new Date(a.start).getTime() : 0;
  const bs = b.start ? new Date(b.start).getTime() : 0;
  return as - bs;
}

/**
 * Merged items across an arbitrary date range — Life OS tasks scheduled in the
 * range **plus** Google Calendar events not created here — for the month
 * calendar. Unlike `getTodayItems`, this is read-only: it never reconciles or
 * deletes, so flipping through months is fast and can't mutate the database.
 * Falls back to app tasks only when Google isn't connected or can't be reached.
 */
export async function getRangeItems(
  rangeStartISO: string,
  rangeEndISO: string,
): Promise<TodayItem[]> {
  const rangeStart = new Date(rangeStartISO);
  const rangeEnd = new Date(rangeEndISO);

  const appItems = db
    .select()
    .from(tasks)
    .all()
    .filter((t) => {
      if (!t.scheduledStart) return false;
      const s = new Date(t.scheduledStart);
      return s >= rangeStart && s < rangeEnd;
    })
    .map(taskToItem);

  let events: CalendarEvent[] | null;
  try {
    events = await listEvents(rangeStartISO, rangeEndISO);
  } catch (err) {
    console.error("[range] listEvents failed; app tasks only:", err);
    return appItems.sort(byStart);
  }
  if (events === null) return appItems.sort(byStart);

  const externalItems: TodayItem[] = events
    .filter((e) => !e.lifeosId && e.start)
    .filter((e) => {
      const s = new Date(e.start!);
      return s >= rangeStart && s < rangeEnd;
    })
    .map((e) => ({
      id: `g:${e.id}`,
      title: e.title,
      start: e.start,
      durationMinutes: diffMinutes(e.start, e.end),
      importance: null,
      completed: false,
      allDay: e.allDay,
      source: "google" as const,
    }));

  return [...appItems, ...externalItems].sort(byStart);
}
