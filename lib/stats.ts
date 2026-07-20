import type { Task } from "./types";
import { addDays, isSameMonth, startOfDay } from "./dates";

/** One day's completion tally, for the recent-activity strip. */
export interface DayCount {
  day: Date;
  count: number;
}

/** Everything the Stats screen shows — all derived from the raw task list. */
export interface Stats {
  /** Every task ever captured (scheduled or to-do). */
  totalTasks: number;
  /** Tasks checked off. */
  completed: number;
  /** Distinct calendar days you completed at least one task — "days worked". */
  daysWorked: number;
  /** Consecutive days with a completion, counting back from today. */
  currentStreak: number;
  /** The best run of consecutive active days, ever. */
  longestStreak: number;
  /** To-dos with a deadline that's now past and still aren't done. */
  missedDeadlines: number;
  /** Completed on or before their deadline (of those that had one). */
  onTime: number;
  /** Completed, but after their deadline. */
  late: number;
  completedThisWeek: number;
  completedThisMonth: number;
  /** Summed duration of completed tasks, in minutes — time invested. */
  minutesInvested: number;
  /** completed / totalTasks, 0–1. */
  completionRate: number;
  /** Completions per day over the trailing window, oldest → newest. */
  recent: DayCount[];
}

/** One tag's slice of the work, for the "By tag" breakdown. */
export interface TagStat {
  tag: string;
  /** Tasks carrying this tag (scheduled or to-do). */
  total: number;
  /** …of which are checked off. */
  completed: number;
  /** completed / total, 0–1. */
  completionRate: number;
  /** Summed duration of this tag's completed tasks, in minutes. */
  minutesInvested: number;
}

/**
 * Per-tag breakdown of the whole task list. Untagged tasks are skipped (there's
 * no "none" bucket — the headline stats already cover the total). Ranked by
 * volume, then by how much got finished, then name — so the tags you lean on
 * most sit at the top. Pure, like `computeStats`.
 */
export function computeTagStats(tasks: Task[]): TagStat[] {
  const byTag = new Map<string, { total: number; completed: number; minutes: number }>();
  for (const t of tasks) {
    if (!t.tag) continue;
    const e = byTag.get(t.tag) ?? { total: 0, completed: 0, minutes: 0 };
    e.total += 1;
    if (t.completed) {
      e.completed += 1;
      e.minutes += t.durationMinutes;
    }
    byTag.set(t.tag, e);
  }
  return [...byTag.entries()]
    .map(([tag, e]) => ({
      tag,
      total: e.total,
      completed: e.completed,
      completionRate: e.total > 0 ? e.completed / e.total : 0,
      minutesInvested: e.minutes,
    }))
    .sort(
      (a, b) =>
        b.total - a.total || b.completed - a.completed || a.tag.localeCompare(b.tag),
    );
}

/** How many days the activity strip covers. */
export const RECENT_DAYS = 14;

const dayKey = (d: Date) => startOfDay(d).getTime();
/** Next calendar day's key — DST-safe (not just +86_400_000). */
const nextDayKey = (k: number) => startOfDay(addDays(new Date(k), 1)).getTime();
const prevDayKey = (k: number) => startOfDay(addDays(new Date(k), -1)).getTime();

/**
 * Compute the productivity stats for a user's whole task list. Pure and
 * deterministic given `now`, so it's cheap to recompute on every render and easy
 * to reason about. "Worked on a day" means: completed at least one task that day
 * (that's the only activity the schema timestamps).
 */
export function computeStats(tasks: Task[], now: Date): Stats {
  const todayK = dayKey(now);

  const completedTasks = tasks.filter((t) => t.completed);
  // Day-based metrics need a real completion timestamp; older rows might lack it.
  const dated = completedTasks.filter((t) => t.completedAt);

  // Distinct active days.
  const daySet = new Set<number>(dated.map((t) => dayKey(new Date(t.completedAt!))));

  // Longest run of consecutive active days.
  const sortedDays = [...daySet].sort((a, b) => a - b);
  let longestStreak = 0;
  let run = 0;
  let prev: number | null = null;
  for (const k of sortedDays) {
    run = prev != null && k === nextDayKey(prev) ? run + 1 : 1;
    if (run > longestStreak) longestStreak = run;
    prev = k;
  }

  // Current streak: back from today (a quiet today doesn't break yesterday's run).
  let currentStreak = 0;
  let cursor: number | null = daySet.has(todayK) ? todayK : daySet.has(prevDayKey(todayK)) ? prevDayKey(todayK) : null;
  while (cursor != null && daySet.has(cursor)) {
    currentStreak += 1;
    cursor = prevDayKey(cursor);
  }

  // Deadline outcomes.
  let onTime = 0;
  let late = 0;
  for (const t of dated) {
    if (!t.dueDate) continue;
    const done = dayKey(new Date(t.completedAt!));
    const due = dayKey(new Date(t.dueDate));
    if (done <= due) onTime += 1;
    else late += 1;
  }
  const missedDeadlines = tasks.filter(
    (t) => !t.completed && t.dueDate && dayKey(new Date(t.dueDate)) < todayK,
  ).length;

  // This week (Mon-start, matching the calendar grid) and this month.
  const dow = (now.getDay() + 6) % 7; // 0 = Monday
  const weekStart = startOfDay(addDays(now, -dow));
  const completedThisWeek = dated.filter((t) => new Date(t.completedAt!) >= weekStart).length;
  const completedThisMonth = dated.filter((t) => isSameMonth(new Date(t.completedAt!), now)).length;

  const minutesInvested = completedTasks.reduce((sum, t) => sum + t.durationMinutes, 0);

  // Trailing daily activity.
  const recent: DayCount[] = [];
  for (let i = RECENT_DAYS - 1; i >= 0; i--) {
    const day = startOfDay(addDays(now, -i));
    const k = day.getTime();
    const count = dated.filter((t) => dayKey(new Date(t.completedAt!)) === k).length;
    recent.push({ day, count });
  }

  return {
    totalTasks: tasks.length,
    completed: completedTasks.length,
    daysWorked: daySet.size,
    currentStreak,
    longestStreak,
    missedDeadlines,
    onTime,
    late,
    completedThisWeek,
    completedThisMonth,
    minutesInvested,
    completionRate: tasks.length > 0 ? completedTasks.length / tasks.length : 0,
    recent,
  };
}
