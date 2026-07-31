import { getCalendarClient, invalidateGoogleTokens, isInvalidGrant } from "./google";
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
 * A short per-(user, window) cache of successful event fetches. The Today view
 * polls `/api/today` every 30s and the month grid + external-busy hooks poll
 * `/api/range`, each of which calls `listEvents`; without this, a single open
 * tab hit Google's Calendar API every few seconds forever. A ~15s TTL means
 * rapid identical-range polls reuse one fetch while external changes still
 * appear within seconds; any write to the user's calendar clears it at once.
 */
interface EventsCacheEntry {
  events: CalendarEvent[];
  expires: number;
}
const eventsCache = new Map<string, EventsCacheEntry>();
const EVENTS_CACHE_TTL_MS = 15_000;
const eventsCacheKey = (userId: string, min: string, max: string) => `${userId}|${min}|${max}`;

/** Drop a user's cached event windows (call after mutating their calendar). */
export function invalidateEventsCache(userId: string): void {
  const prefix = `${userId}|`;
  for (const key of eventsCache.keys()) {
    if (key.startsWith(prefix)) eventsCache.delete(key);
  }
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
  userId: string,
  timeMinISO: string,
  timeMaxISO: string,
): Promise<CalendarEvent[] | null> {
  const c = await getCalendarClient(userId);
  if (!c) return null;

  const cacheKey = eventsCacheKey(userId, timeMinISO, timeMaxISO);
  const cached = eventsCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.events;

  const items = [];
  try {
    // Follow nextPageToken so a busy window can't silently truncate — a
    // truncated list once looked like mass deletion to the reconciler.
    let pageToken: string | undefined;
    let pages = 0;
    do {
      const res = await c.calendar.events.list({
        calendarId: c.calendarId,
        timeMin: timeMinISO,
        timeMax: timeMaxISO,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 2500,
        pageToken,
      });
      items.push(...(res.data.items ?? []));
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken && ++pages < 8);
  } catch (err) {
    // A dead refresh token will never recover — drop it so the app switches to
    // "disconnected" and prompts a reconnect (rather than erroring every request).
    if (isInvalidGrant(err)) {
      invalidateGoogleTokens(userId);
      return null;
    }
    throw err; // genuine/transient error — bubble up so callers don't wipe tasks.
  }
  const events = items
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
  eventsCache.set(cacheKey, { events, expires: Date.now() + EVENTS_CACHE_TTL_MS });
  return events;
}

/**
 * Definitive existence check for one event — the reconciler's source of truth
 * before deleting a local task. Absence from a list fetch is only a suspicion
 * (truncation, an event moved outside the window, list lag after create);
 * `events.get` answers for the event itself. Any uncertainty (network error,
 * not connected) returns "unknown" so callers keep the task.
 */
export async function eventExists(
  userId: string,
  eventId: string,
): Promise<boolean | "unknown"> {
  const c = await getCalendarClient(userId);
  if (!c) return "unknown";
  try {
    const res = await c.calendar.events.get({ calendarId: c.calendarId, eventId });
    return res.data.status !== "cancelled";
  } catch (err) {
    const status =
      (err as { response?: { status?: number } }).response?.status ??
      (err as { code?: number }).code;
    if (status === 404 || status === 410) return false;
    if (isInvalidGrant(err)) invalidateGoogleTokens(userId);
    return "unknown";
  }
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
export async function createEvent(userId: string, task: Task): Promise<string | null> {
  if (!task.scheduledStart) return null;
  const c = await getCalendarClient(userId);
  if (!c) return null;
  try {
    const res = await c.calendar.events.insert({
      calendarId: c.calendarId,
      requestBody: eventBody(task),
    });
    invalidateEventsCache(userId);
    return res.data.id ?? null;
  } catch (err) {
    if (isInvalidGrant(err)) invalidateGoogleTokens(userId);
    console.error("[calendar] create failed:", err);
    return null;
  }
}

export async function updateEvent(userId: string, task: Task): Promise<void> {
  if (!task.googleEventId || !task.scheduledStart) return;
  const c = await getCalendarClient(userId);
  if (!c) return;
  try {
    await c.calendar.events.patch({
      calendarId: c.calendarId,
      eventId: task.googleEventId,
      requestBody: eventBody(task),
    });
    invalidateEventsCache(userId);
  } catch (err) {
    if (isInvalidGrant(err)) invalidateGoogleTokens(userId);
    console.error("[calendar] update failed:", err);
  }
}

export async function deleteEvent(userId: string, eventId: string): Promise<void> {
  const c = await getCalendarClient(userId);
  if (!c) return;
  try {
    await c.calendar.events.delete({ calendarId: c.calendarId, eventId });
    invalidateEventsCache(userId);
  } catch (err) {
    if (isInvalidGrant(err)) invalidateGoogleTokens(userId);
    // 404/410 = already gone; anything else we just log.
    console.error("[calendar] delete failed:", err);
  }
}

/**
 * Reconcile a task's calendar event to match its current state.
 * Returns the event id to persist (possibly new, or null if removed/none).
 */
export async function syncEvent(userId: string, task: Task): Promise<string | null> {
  const hasSlot = !!task.scheduledStart;
  if (hasSlot) {
    if (task.googleEventId) {
      await updateEvent(userId, task);
      return task.googleEventId;
    }
    return await createEvent(userId, task);
  }
  // No slot → remove any existing event.
  if (task.googleEventId) {
    await deleteEvent(userId, task.googleEventId);
  }
  return null;
}
