import { eq } from "drizzle-orm";
import { db } from "./db";
import { tasks } from "./db/schema";
import { eventExists, listEvents, type CalendarEvent } from "./calendar";
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
 * The merged Today list: Life OS tasks scheduled for the day **plus** events
 * read live from Google Calendar that weren't created here.
 *
 * It also performs two-way deletion sync: if a Life OS task's calendar event has
 * been deleted in Google, the task is removed from the database here so it
 * disappears from the app too. To stay safe, this only runs when the Google
 * fetch actually succeeds (so an outage can never delete your tasks), and only
 * for tasks whose own event id is missing — moving an event to another day keeps
 * the same id, so reschedules in Google don't trigger a delete.
 */
export async function getTodayItems(
  dayStartISO: string,
  dayEndISO: string,
): Promise<TodayItem[]> {
  const dayStart = new Date(dayStartISO);
  const dayEnd = new Date(dayEndISO);

  const tasksInDay = (): Row[] =>
    db
      .select()
      .from(tasks)
      .all()
      .filter((t) => {
        if (!t.scheduledStart) return false;
        const s = new Date(t.scheduledStart);
        return s >= dayStart && s < dayEnd;
      });

  // Reconcile a little before today through ~5 weeks out, so deleting a
  // near-future event in Google also clears it here (the app only shows Today,
  // but this keeps the DB honest for days you can still schedule into).
  const recStart = new Date(dayStart.getTime() - 24 * 3600 * 1000);
  const recEnd = new Date(dayEnd.getTime() + 35 * 24 * 3600 * 1000);

  let events: CalendarEvent[] | null;
  try {
    events = await listEvents(recStart.toISOString(), recEnd.toISOString());
  } catch (err) {
    // Couldn't reach Google — show app tasks only, do NOT reconcile/delete.
    console.error("[today] listEvents failed; skipping reconcile:", err);
    return tasksInDay().map(taskToItem).sort(byStart);
  }

  // Not connected → app tasks only.
  if (events === null) {
    return tasksInDay().map(taskToItem).sort(byStart);
  }

  const existingIds = new Set(events.map((e) => e.id));

  // Deletion sync: drop an in-window task only when Google *confirms* its
  // event is gone. Absence from the list is just a suspicion — the fetch may
  // be truncated, the event may have been moved outside the window, or it may
  // be too fresh to appear — so each suspect is checked individually with
  // events.get, and anything uncertain is kept. Completed tasks are never
  // reconcile-deleted: tidying an old event out of Google must not erase the
  // record that the task happened.
  for (const t of db.select().from(tasks).all()) {
    if (!t.googleEventId || !t.scheduledStart) continue;
    if (t.completed) continue;
    const s = new Date(t.scheduledStart);
    if (s < recStart || s > recEnd) continue;
    if (existingIds.has(t.googleEventId)) continue;
    if ((await eventExists(t.googleEventId)) === false) {
      db.delete(tasks).where(eq(tasks.id, t.id)).run();
    }
  }

  const appItems = tasksInDay().map(taskToItem);

  // External Google events for the day (not created by Life OS).
  const externalItems: TodayItem[] = events
    .filter((e) => !e.lifeosId && e.start)
    .filter((e) => {
      const s = new Date(e.start!);
      return s >= dayStart && s < dayEnd;
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
