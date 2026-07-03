"use client";
import { AnimatePresence } from "motion/react";
import type { DayGroups } from "../lib/dayShape";
import { Spotlight } from "./Spotlight";
import { TaskRow } from "./TaskRow";
import { CalendarIcon } from "./icons";

/**
 * The day's feed: the current (or next) block as the spotlight "Now", then a
 * full "Up next" list of every remaining upcoming activity.
 */
export function DayFeed({ groups, now }: { groups: DayGroups; now: Date }) {
  const { spotlight, upcoming, allDay } = groups;
  if (!spotlight && upcoming.length === 0 && allDay.length === 0) return null;

  return (
    <div>
      {allDay.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {allDay.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-paper-edge/60 px-3 py-1 text-xs font-medium text-ink"
            >
              <CalendarIcon className="h-3.5 w-3.5 text-muted" />
              {item.title}
            </span>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {spotlight && <Spotlight key={spotlight.id} item={spotlight} now={now} />}
      </AnimatePresence>

      {upcoming.length > 0 && (
        <section>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
            Up next
          </p>
          {/* Only the next few — the timeline above already shows the whole day. */}
          <div className="space-y-2.5">
            <AnimatePresence initial={false}>
              {upcoming.slice(0, 3).map((item) => (
                <TaskRow key={item.id} item={item} />
              ))}
            </AnimatePresence>
          </div>
          {upcoming.length > 3 && (
            <p className="mt-2.5 text-xs text-muted-soft">
              +{upcoming.length - 3} more on your timeline above
            </p>
          )}
        </section>
      )}
    </div>
  );
}
