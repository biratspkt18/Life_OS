import { getCalendarClient } from "./google";
import { endOf } from "../dates";
import type { Task } from "../types";

export interface CalendarEvent {
  id: string;
  /** Our task id, if this event was created by Life OS. */
  lifeosId: string | null;
  title: string;
  start: string | null; // ISO datetime, or a date string for all-day
  end: string | null;
  allDay: boolean;
}

/**
 * List events on the primary calendar within [timeMin, timeMax].
 *
 * Returns `null` when Google isn't connected. **Throws** if the API call fails,
 * so callers can tell "the calendar is genuinely empty" (`[]`) apart from
 * "couldn't reach Google" (throw) — critical before reconciling deletions, so a
 * transient outage never wipes tasks.
 */
export async function listEvents(
  timeMinISO: string,
  timeMaxISO: string,
): Promise<CalendarEvent[] | null> {
  const c = await getCalendarClient();
  if (!c) return null;
  const res = await c.calendar.events.list({
    calendarId: c.calendarId,
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
  });
  return (res.data.items ?? [])
    .filter((e) => e.status !== "cancelled" && e.id)
    .map((e) => ({
      id: e.id!,
      // Read the current key, falling back to the legacy `daybookId` so events
      // created before the rename still link to their task.
      lifeosId:
        e.extendedProperties?.private?.lifeosId ??
        e.extendedProperties?.private?.daybookId ??
        null,
      title: e.summary ?? "(untitled)",
      start: e.start?.dateTime ?? e.start?.date ?? null,
      end: e.end?.dateTime ?? e.end?.date ?? null,
      allDay: !e.start?.dateTime,
    }));
}

function eventBody(task: Task) {
  const start = new Date(task.scheduledStart!);
  const end = endOf(start, task.durationMinutes);
  return {
    summary: task.title,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    // We tag the event with our id so it's identifiable as a Life OS event.
    // (No `source` field: Google rejects a source without a valid public URL,
    // which a localhost app doesn't have — "Invalid source url".)
    extendedProperties: { private: { lifeosId: task.id } },
  };
}

/** Create an event for a scheduled task; returns the Google event id, or null. */
export async function createEvent(task: Task): Promise<string | null> {
  if (!task.scheduledStart) return null;
  const c = await getCalendarClient();
  if (!c) return null;
  try {
    const res = await c.calendar.events.insert({
      calendarId: c.calendarId,
      requestBody: eventBody(task),
    });
    return res.data.id ?? null;
  } catch (err) {
    console.error("[calendar] create failed:", err);
    return null;
  }
}

export async function updateEvent(task: Task): Promise<void> {
  if (!task.googleEventId || !task.scheduledStart) return;
  const c = await getCalendarClient();
  if (!c) return;
  try {
    await c.calendar.events.patch({
      calendarId: c.calendarId,
      eventId: task.googleEventId,
      requestBody: eventBody(task),
    });
  } catch (err) {
    console.error("[calendar] update failed:", err);
  }
}

export async function deleteEvent(eventId: string): Promise<void> {
  const c = await getCalendarClient();
  if (!c) return;
  try {
    await c.calendar.events.delete({ calendarId: c.calendarId, eventId });
  } catch (err) {
    // 404/410 = already gone; anything else we just log.
    console.error("[calendar] delete failed:", err);
  }
}

/**
 * Reconcile a task's calendar event to match its current state.
 * Returns the event id to persist (possibly new, or null if removed/none).
 */
export async function syncEvent(task: Task): Promise<string | null> {
  const hasSlot = !!task.scheduledStart;
  if (hasSlot) {
    if (task.googleEventId) {
      await updateEvent(task);
      return task.googleEventId;
    }
    return await createEvent(task);
  }
  // No slot → remove any existing event.
  if (task.googleEventId) {
    await deleteEvent(task.googleEventId);
  }
  return null;
}
