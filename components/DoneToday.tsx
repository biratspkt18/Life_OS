"use client";
import type { TodayItem } from "../lib/types";
import { timeLabel } from "../lib/dates";
import { CalendarIcon, CheckIcon } from "./icons";

/**
 * "Done today" — a calm record at the bottom of Today: tasks you checked off,
 * plus Google Calendar events read from your calendar (which the app can't
 * check, so they count once they've passed).
 */
export function DoneToday({ items, now }: { items: TodayItem[]; now: Date }) {
  const done = items
    .filter((i) => {
      if (i.source === "lifeos") return i.completed;
      // Google external event: count it once it has happened.
      if (i.allDay) return true;
      const start = i.start ? new Date(i.start) : null;
      const end =
        start && i.durationMinutes != null
          ? new Date(start.getTime() + i.durationMinutes * 60_000)
          : start;
      return end ? end <= now : false;
    })
    .sort(
      (a, b) =>
        (a.start ? new Date(a.start).getTime() : 0) - (b.start ? new Date(b.start).getTime() : 0),
    );

  if (done.length === 0) return null;

  return (
    <section className="mt-8 border-t border-paper-edge pt-6">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Done today</h2>
        <span className="text-xs font-semibold text-sage">{done.length}</span>
      </div>
      <div className="space-y-2">
        {done.map((i) => (
          <div key={i.id} className="flex items-center gap-2.5 text-sm">
            {i.source === "google" ? (
              <CalendarIcon className="h-4 w-4 shrink-0 text-gold-soft" />
            ) : (
              <CheckIcon className="h-4 w-4 shrink-0 text-sage" />
            )}
            <span className="text-muted line-through decoration-muted/40">{i.title}</span>
            {i.start && !i.allDay && (
              <span className="text-xs text-muted-soft">{timeLabel(new Date(i.start))}</span>
            )}
            {i.source === "google" && <span className="text-xs text-muted-soft">· calendar</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
