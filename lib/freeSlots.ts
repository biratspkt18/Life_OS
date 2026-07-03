import type { Settings, Task } from "./types";
import { windowForDay } from "./types";
import { addDays, addMinutes, atTime, startOfDay } from "./dates";

interface Interval {
  start: Date;
  end: Date;
}

/** Round a time up to the next `step`-minute boundary. */
function roundUpToStep(d: Date, step: number): Date {
  const ms = step * 60_000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
}

/**
 * Enumerate concrete free start-times where a task of `durationMinutes` fits
 * inside the working window without overlapping existing tasks. Soonest first,
 * spread across upcoming days — so the user can *choose* when to do it, rather
 * than the app dropping it wherever.
 */
export function findFreeSlots(opts: {
  durationMinutes: number;
  settings: Settings;
  tasks: Task[];
  now: Date;
  fromDay?: Date;
  days?: number;
  excludeTaskId?: string;
  /** External busy intervals (e.g. Google events) to also schedule around. */
  externalBusy?: Interval[];
  stepMinutes?: number;
  maxPerDay?: number;
  limit?: number;
}): Date[] {
  const { durationMinutes, settings, tasks, now } = opts;
  const externalBusy = opts.externalBusy ?? [];
  const days = opts.days ?? 7;
  const step = opts.stepMinutes ?? 30;
  const maxPerDay = opts.maxPerDay ?? 4;
  const limit = opts.limit ?? 8;
  const fromDay = startOfDay(opts.fromDay ?? now);

  const out: Date[] = [];

  for (let d = 0; d < days && out.length < limit; d++) {
    const day = addDays(fromDay, d);
    const win = windowForDay(settings, day);
    if (!win.enabled) continue;

    const winStart = atTime(day, win.dayWindowStart);
    const winEnd = atTime(day, win.dayWindowEnd);
    if (winEnd <= winStart) continue;

    const taskBusy: Interval[] = tasks
      .filter((t) => t.scheduledStart && t.id !== opts.excludeTaskId)
      .map((t) => {
        const s = new Date(t.scheduledStart!);
        return { start: s, end: addMinutes(s, t.durationMinutes) };
      });

    const busy: Interval[] = [...taskBusy, ...externalBusy]
      .filter((iv) => iv.end > winStart && iv.start < winEnd)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    // Don't propose times in the past on today.
    let cursor = winStart;
    if (day.getTime() === startOfDay(now).getTime() && now > cursor) {
      cursor = roundUpToStep(now, step);
    }

    let perDay = 0;
    while (perDay < maxPerDay && out.length < limit) {
      const end = addMinutes(cursor, durationMinutes);
      if (end > winEnd) break;
      const conflict = busy.find((iv) => cursor < iv.end && iv.start < end);
      if (conflict) {
        // Resume the moment the blocker ends — that exact time is a real opening
        // (e.g. a 3:15–3:30 gap), so don't round it up past the gap.
        cursor = conflict.end;
      } else {
        out.push(new Date(cursor));
        perDay += 1;
        cursor = addMinutes(cursor, step);
      }
    }
  }

  return out;
}
