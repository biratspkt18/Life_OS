"use client";
import { useMemo } from "react";
import { motion } from "motion/react";
import { useAllTasks, useExternalBusy, useSettings } from "../hooks/useDb";
import { findFreeSlots } from "../lib/freeSlots";
import { startOfDay, timeLabel } from "../lib/dates";
import { cn } from "../lib/utils";

function bucketByPartOfDay(slots: Date[]) {
  const buckets = [
    { label: "Morning", slots: [] as Date[] },
    { label: "Afternoon", slots: [] as Date[] },
    { label: "Evening", slots: [] as Date[] },
  ];
  for (const s of slots) {
    const h = s.getHours();
    if (h < 12) buckets[0].slots.push(s);
    else if (h < 17) buckets[1].slots.push(s);
    else buckets[2].slots.push(s);
  }
  return buckets.filter((b) => b.slots.length > 0);
}

/**
 * The open times on a given day where a task of `durationMinutes` fits — dodging
 * every other task and Google event, inside the working window, never in the
 * past. Grouped by part of day, tap to select. `excludeId` frees up the task's
 * own current slot when editing.
 */
export function FreeSlotChips({
  day,
  durationMinutes,
  excludeId,
  selected,
  onSelect,
  now,
}: {
  day: Date;
  durationMinutes: number;
  excludeId?: string;
  selected: Date | null;
  onSelect: (slot: Date) => void;
  now: Date;
}) {
  const settings = useSettings();
  const tasks = useAllTasks();
  const externalBusy = useExternalBusy(startOfDay(day), 1);

  const slots = useMemo(
    () =>
      findFreeSlots({
        durationMinutes,
        settings,
        tasks,
        now,
        fromDay: day,
        days: 1,
        excludeTaskId: excludeId,
        externalBusy,
        stepMinutes: 15,
        maxPerDay: 80,
        limit: 80,
      }),
    [durationMinutes, settings, tasks, now, day, excludeId, externalBusy],
  );

  if (slots.length === 0) {
    return (
      <p className="rounded-xl border border-danger/40 bg-danger-wash px-3.5 py-3 text-sm font-medium text-danger">
        No open time that fits on this day — try another day.
      </p>
    );
  }

  const buckets = bucketByPartOfDay(slots);

  return (
    <div className="space-y-2.5">
      {buckets.map((bucket) => (
        <div key={bucket.label}>
          <p className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-soft">
            {bucket.label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {bucket.slots.map((s) => {
              const on = !!selected && s.getTime() === selected.getTime();
              return (
                <motion.button
                  key={s.toISOString()}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onSelect(s)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-xl border px-3 py-1.5 text-sm font-medium tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40",
                    on
                      ? "border-accent bg-accent text-white shadow-accent"
                      : "border-paper-edge bg-paper-card text-ink hover:border-accent/50 hover:bg-accent-wash",
                  )}
                >
                  {timeLabel(s)}
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
