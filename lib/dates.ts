import {
  addDays,
  addMinutes,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  isTomorrow,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export interface Interval {
  start: Date;
  end: Date;
}

/** "HH:mm" -> minutes since midnight. */
export function parseHHmm(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

/** Build a Date on `day` at the given "HH:mm". */
export function atTime(day: Date, hhmm: string): Date {
  return addMinutes(startOfDay(day), parseHHmm(hhmm));
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function endOf(start: Date, durationMinutes: number): Date {
  return addMinutes(start, durationMinutes);
}

/** Friendly day label: Today / Tomorrow / "Mon 24 Jun". */
export function dayLabel(d: Date): string {
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE d MMM");
}

/** "9:00 AM" style. */
export function timeLabel(d: Date): string {
  return format(d, "h:mm a");
}

/** "Today · 9:00 AM" style for a proposal/row. */
export function whenLabel(d: Date): string {
  return `${dayLabel(d)} · ${timeLabel(d)}`;
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/**
 * The weeks of a month as a grid of days, padded with leading/trailing days
 * from adjacent months so every row holds 7 cells (Sun–Sat). For the calendar
 * date picker.
 */
export function monthGrid(month: Date): Date[][] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

export {
  addDays,
  addMinutes,
  addMonths,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  isTomorrow,
  startOfDay,
  startOfMonth,
  format,
};
