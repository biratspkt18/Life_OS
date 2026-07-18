"use client";
import { useMemo } from "react";
import useSWR from "swr";
import { DEFAULT_SETTINGS, type Settings, type Task, type TodayItem } from "../lib/types";
import { addDays, isSameDay, monthGrid, startOfDay, type Interval } from "../lib/dates";
import { SETTINGS_KEY, TAGS_KEY, TASKS_KEY } from "../lib/tasks";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
};

/** All tasks (live-ish: revalidates on focus and on a short interval). */
export function useAllTasks(): Task[] {
  const { data } = useSWR<Task[]>(TASKS_KEY, fetcher, {
    refreshInterval: 20_000,
    revalidateOnFocus: true,
    fallbackData: [],
  });
  return data ?? [];
}

export function useSettings(): Settings {
  const { data } = useSWR<Settings>(SETTINGS_KEY, fetcher, {
    fallbackData: DEFAULT_SETTINGS,
  });
  return data ?? DEFAULT_SETTINGS;
}

/** The user's tags, most-used first (derived server-side from their tasks). */
export function useTags(): string[] {
  const { data } = useSWR<string[]>(TAGS_KEY, fetcher, { fallbackData: [] });
  return data ?? [];
}

/** Today's scheduled tasks in time order. */
export function useTodayTasks(now: Date): Task[] {
  const all = useAllTasks();
  const dayKey = now.toDateString();
  return useMemo(
    () =>
      all
        .filter((t) => t.scheduledStart && isSameDay(new Date(t.scheduledStart), now))
        .sort(
          (a, b) =>
            new Date(a.scheduledStart!).getTime() - new Date(b.scheduledStart!).getTime(),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, dayKey],
  );
}

/**
 * A given day's merged list — Life OS tasks + live Google Calendar events —
 * straight from the server (`/api/today`), which also reconciles deletions made
 * in Google. Revalidates on focus and on a short interval so changes show up.
 */
export function useDayItems(day: Date): TodayItem[] {
  const start = startOfDay(day);
  const end = addDays(start, 1);
  const key = `/api/today?start=${start.toISOString()}&end=${end.toISOString()}`;
  const { data } = useSWR<TodayItem[]>(key, fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    fallbackData: [],
  });
  return data ?? [];
}

/**
 * Every item (Life OS tasks + Google events) across a month's visible grid —
 * the leading/trailing days from adjacent months are included so edge cells get
 * their dots too. Read-only on the server, so flipping months never mutates the
 * database. Returns the items plus a map bucketed by `toDateString()`.
 */
export function useMonthItems(month: Date): {
  items: TodayItem[];
  byDay: Map<string, TodayItem[]>;
} {
  const weeks = monthGrid(month);
  const gridStart = startOfDay(weeks[0][0]);
  const gridEnd = addDays(startOfDay(weeks[weeks.length - 1][6]), 1);
  const key = `/api/range?start=${gridStart.toISOString()}&end=${gridEnd.toISOString()}`;
  const { data } = useSWR<TodayItem[]>(key, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    fallbackData: [],
  });

  return useMemo(() => {
    const items = data ?? [];
    const byDay = new Map<string, TodayItem[]>();
    for (const item of items) {
      if (!item.start) continue;
      const k = new Date(item.start).toDateString();
      const list = byDay.get(k);
      if (list) list.push(item);
      else byDay.set(k, [item]);
    }
    return { items, byDay };
  }, [data]);
}

/** Fallback length (minutes) for a timed item that doesn't report a duration. */
const BUSY_FALLBACK_MINUTES = 30;

/** A busy interval that remembers what's occupying it (for conflict messages). */
export interface BusyInterval extends Interval {
  title: string;
}

// A completed task still occupies its slot (you spent that time), so done items
// count as busy too — only all-day / unscheduled items are skipped.
function itemToInterval(item: TodayItem): BusyInterval | null {
  if (item.allDay || !item.start) return null;
  const start = new Date(item.start);
  const dur = item.durationMinutes ?? BUSY_FALLBACK_MINUTES;
  return { start, end: new Date(start.getTime() + dur * 60_000), title: item.title };
}

/**
 * Busy intervals on a single day — Life OS tasks **and** Google events merged
 * from `/api/today` — for live conflict checks while picking a time. Optionally
 * excludes one task id (the one being rescheduled, so it doesn't clash with
 * itself).
 */
export function useDayBusy(day: Date, excludeId?: string): BusyInterval[] {
  const items = useDayItems(day);
  return useMemo(
    () =>
      items
        .filter((i) => i.id !== excludeId)
        .map(itemToInterval)
        .filter((iv): iv is BusyInterval => iv !== null),
    [items, excludeId],
  );
}

/**
 * Google Calendar busy intervals across the next `days` days, so the scheduling
 * brain proposes times that dodge external events (not just Life OS tasks).
 * Returns [] when Google isn't connected.
 */
export function useExternalBusy(fromDay: Date, days = 30): Interval[] {
  const start = startOfDay(fromDay);
  const end = addDays(start, days);
  const key = `/api/range?start=${start.toISOString()}&end=${end.toISOString()}`;
  const { data } = useSWR<TodayItem[]>(key, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    fallbackData: [],
  });
  return useMemo(
    () =>
      (data ?? [])
        .filter((i) => i.source === "google")
        .map(itemToInterval)
        .filter((iv): iv is BusyInterval => iv !== null),
    [data],
  );
}

/** Inbox: captured tasks with no scheduled time yet (and not completed). */
export function useInboxTasks(): Task[] {
  const all = useAllTasks();
  return useMemo(
    () =>
      all
        .filter((t) => !t.scheduledStart && !t.completed)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [all],
  );
}

/** A to-do whose date slipped: which date missed, and the day it was meant for. */
export interface MissedTodo {
  task: Task;
  missed: "due" | "preferred";
  when: Date;
}

/**
 * Inbox to-dos whose due or preferred date is in the past — loose ends now.
 * A slipped due date outranks a slipped preferred date, matching the old
 * To-do-screen triage. Sorted most-slipped first.
 */
export function useMissedTodos(now: Date): MissedTodo[] {
  const inbox = useInboxTasks();
  const dayKey = startOfDay(now).getTime();
  return useMemo(() => {
    const out: MissedTodo[] = [];
    for (const task of inbox) {
      const due = task.dueDate ? startOfDay(new Date(task.dueDate)) : null;
      const preferred = task.preferredDate ? startOfDay(new Date(task.preferredDate)) : null;
      if (due && due.getTime() < dayKey) out.push({ task, missed: "due", when: due });
      else if (preferred && preferred.getTime() < dayKey)
        out.push({ task, missed: "preferred", when: preferred });
    }
    return out.sort((a, b) => a.when.getTime() - b.when.getTime());
  }, [inbox, dayKey]);
}

/** Undone past tasks the reschedule loop collects: past start, not completed. */
export function usePastUndoneTasks(now: Date): Task[] {
  const all = useAllTasks();
  const minuteKey = Math.floor(now.getTime() / 60000);
  return useMemo(
    () =>
      all
        .filter((t) => !t.completed && t.scheduledStart && new Date(t.scheduledStart) < now)
        .sort(
          (a, b) =>
            new Date(a.scheduledStart!).getTime() - new Date(b.scheduledStart!).getTime(),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, minuteKey],
  );
}
