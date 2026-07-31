import { and, eq, gte, isNotNull, lt, lte } from "drizzle-orm";
import { db } from "./db";
import { tasks } from "./db/schema";
import { eventExists, listEvents, type CalendarEvent } from "./calendar";
import { byStart, googleEventToItem, taskToItem } from "./taskItem";
import type { TodayItem } from "../types";

type Row = typeof tasks.$inferSelect;

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
  userId: string,
  dayStartISO: string,
  dayEndISO: string,
): Promise<TodayItem[]> {
  const dayStart = new Date(dayStartISO);
  const dayEnd = new Date(dayEndISO);

  // The day's tasks, bounded in SQL (ISO strings sort chronologically) so the
  // (user_id, scheduled_start) index is used instead of scanning the table.
  const tasksInDay = (): Row[] =>
    db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          gte(tasks.scheduledStart, dayStartISO),
          lt(tasks.scheduledStart, dayEndISO),
        ),
      )
      .all();

  // Reconcile a little before today through ~5 weeks out, so deleting a
  // near-future event in Google also clears it here (the app only shows Today,
  // but this keeps the DB honest for days you can still schedule into).
  const recStart = new Date(dayStart.getTime() - 24 * 3600 * 1000);
  const recEnd = new Date(dayEnd.getTime() + 35 * 24 * 3600 * 1000);

  let events: CalendarEvent[] | null;
  try {
    events = await listEvents(userId, recStart.toISOString(), recEnd.toISOString());
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
  // Only incomplete, calendar-linked tasks inside the reconcile window are
  // suspects — scoped in SQL so we don't walk the user's whole table.
  const suspects = db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.completed, false),
        isNotNull(tasks.googleEventId),
        gte(tasks.scheduledStart, recStart.toISOString()),
        lte(tasks.scheduledStart, recEnd.toISOString()),
      ),
    )
    .all();
  for (const t of suspects) {
    if (existingIds.has(t.googleEventId!)) continue;
    if ((await eventExists(userId, t.googleEventId!)) === false) {
      db.delete(tasks).where(and(eq(tasks.id, t.id), eq(tasks.userId, userId))).run();
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
    .map(googleEventToItem);

  return [...appItems, ...externalItems].sort(byStart);
}
