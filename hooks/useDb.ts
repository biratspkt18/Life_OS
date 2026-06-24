"use client";
import { useMemo } from "react";
import useSWR from "swr";
import { DEFAULT_SETTINGS, type Settings, type Task, type TodayItem } from "../lib/types";
import { addDays, isSameDay, startOfDay } from "../lib/dates";
import { SETTINGS_KEY, TASKS_KEY } from "../lib/tasks";

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
 * Today's merged list — Daybook tasks + live Google Calendar events — straight
 * from the server (`/api/today`), which also reconciles deletions made in
 * Google. Revalidates on focus and on a short interval so changes show up.
 */
export function useTodayItems(now: Date): TodayItem[] {
  const start = startOfDay(now);
  const end = addDays(start, 1);
  const key = `/api/today?start=${start.toISOString()}&end=${end.toISOString()}`;
  const { data } = useSWR<TodayItem[]>(key, fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    fallbackData: [],
  });
  return data ?? [];
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
