import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "./db";
import { tasks } from "./db/schema";
import { listEvents, type CalendarEvent } from "./calendar";
import { byStart, googleEventToItem, taskToItem } from "./taskItem";
import type { TodayItem } from "../types";

/**
 * Merged items across an arbitrary date range — Life OS tasks scheduled in the
 * range **plus** Google Calendar events not created here — for the month
 * calendar. Unlike `getTodayItems`, this is read-only: it never reconciles or
 * deletes, so flipping through months is fast and can't mutate the database.
 * Falls back to app tasks only when Google isn't connected or can't be reached.
 */
export async function getRangeItems(
  userId: string,
  rangeStartISO: string,
  rangeEndISO: string,
): Promise<TodayItem[]> {
  const rangeStart = new Date(rangeStartISO);
  const rangeEnd = new Date(rangeEndISO);

  // Bounded in SQL (ISO strings sort chronologically) so the
  // (user_id, scheduled_start) index serves the month grid.
  const appItems = db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        gte(tasks.scheduledStart, rangeStartISO),
        lt(tasks.scheduledStart, rangeEndISO),
      ),
    )
    .all()
    .map(taskToItem);

  let events: CalendarEvent[] | null;
  try {
    events = await listEvents(userId, rangeStartISO, rangeEndISO);
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
    .map(googleEventToItem);

  return [...appItems, ...externalItems].sort(byStart);
}
