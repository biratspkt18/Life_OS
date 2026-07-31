import { and, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "./db";
import { tasks } from "./db/schema";
import { listEvents } from "./calendar";

/** A booking that would clash with the requested time. */
export interface Conflict {
  title: string;
  start: string; // ISO
  end: string; // ISO
  source: "lifeos" | "google";
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Find the first thing already on the calendar that overlaps the interval
 * `[start, start + durationMinutes)` — either an incomplete Life OS task in the
 * local DB ("application") or an event on the connected Google Calendar.
 *
 * `excludeTaskId` skips the task being moved (and, implicitly, its own Google
 * event, which carries that id). All-day Google events never block a timed
 * booking. If Google can't be reached we still report DB conflicts — better to
 * enforce what we can than to fail open entirely.
 */
export async function findConflict(
  userId: string,
  startISO: string,
  durationMinutes: number,
  excludeTaskId?: string,
): Promise<Conflict | null> {
  const start = new Date(startISO).getTime();
  const end = start + durationMinutes * 60_000;

  // 1) Local Life OS tasks — this user's only. A *completed* task still holds
  //    its slot — you already spent that time, so nothing new may overlap it.
  //    A task starting at/after our end can't overlap, so bound the scan there
  //    in SQL (the (user_id, scheduled_start) index handles it); the precise
  //    overlap test — including the unbounded lower edge — stays in JS so no
  //    long task starting earlier is ever missed.
  const endISO = new Date(end).toISOString();
  const candidates = db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.userId, userId), isNotNull(tasks.scheduledStart), lt(tasks.scheduledStart, endISO)),
    )
    .all();
  for (const t of candidates) {
    if (t.id === excludeTaskId || !t.scheduledStart) continue;
    const s = new Date(t.scheduledStart).getTime();
    const e = s + t.durationMinutes * 60_000;
    if (overlaps(start, end, s, e)) {
      return {
        title: t.title,
        start: new Date(s).toISOString(),
        end: new Date(e).toISOString(),
        source: "lifeos",
      };
    }
  }

  // 2) Google Calendar events (external ones only — Life OS's own events are
  //    already represented by the DB tasks above, so counting them too would
  //    double-report). A Google fetch failure is non-fatal.
  let events;
  try {
    events = await listEvents(userId, new Date(startISO).toISOString(), new Date(end).toISOString());
  } catch {
    return null;
  }
  if (!events) return null;

  for (const ev of events) {
    if (ev.allDay || !ev.start || ev.lifeosId) continue;
    const s = new Date(ev.start).getTime();
    const e = ev.end ? new Date(ev.end).getTime() : s;
    if (overlaps(start, end, s, e)) {
      return {
        title: ev.title,
        start: new Date(s).toISOString(),
        end: new Date(e).toISOString(),
        source: "google",
      };
    }
  }

  return null;
}
