"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useAllTasks, useExternalBusy, useSettings } from "../hooks/useDb";
import { ConflictError, rescheduleTask, updateTask } from "../lib/tasks";
import type { Task } from "../lib/types";
import { findFreeSlots } from "../lib/freeSlots";
import {
  addDays,
  dayLabel,
  durationLabel,
  format,
  isSameDay,
  isToday,
  isTomorrow,
  startOfDay,
  timeLabel,
} from "../lib/dates";
import { cn } from "../lib/utils";
import { CloseIcon } from "./icons";
import { Button } from "./ui/button";

const EVENT = "lifeos:reschedule";
/** How far ahead we look for free time. */
const HORIZON_DAYS = 14;

/** Open the shared reschedule modal for a task, from anywhere. */
export function openReschedule(taskId: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { taskId } }));
}

/**
 * The shared "find a time" modal — used to place a to-do onto the calendar, to
 * reschedule a task, or to log when a done task happened. It only ever offers
 * slots you're actually free for: pick a day, then tap an open time. No manual
 * time entry, no way to double-book. Rendered once (in the Shell).
 */
export function RescheduleHost({ now }: { now: Date }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const tasks = useAllTasks();

  useEffect(() => {
    function onOpen(e: Event) {
      setTaskId((e as CustomEvent<{ taskId: string }>).detail.taskId);
    }
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!taskId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setTaskId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [taskId]);

  if (!taskId) return null;
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;

  const isNew = !task.scheduledStart;
  const heading = task.completed ? "Log the time" : isNew ? "Find a time" : "Reschedule";
  const close = () => setTaskId(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink/25 backdrop-blur-[2px] animate-fade-in"
        onClick={close}
      />
      <motion.div
        className="surface relative z-10 w-full max-w-md rounded-b-none rounded-t-2xl p-5 sm:m-4 sm:rounded-2xl"
        initial={{ y: 24, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
      >
        <div className="mb-1 flex items-start justify-between">
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">{heading}</h2>
          <button
            onClick={close}
            className="-mr-1.5 -mt-1 rounded-lg p-1.5 text-muted-soft transition-colors hover:bg-paper-edge/60 hover:text-ink"
            aria-label="Close"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm font-medium text-ink">{task.title}</p>
        <p className="mb-4 text-xs text-muted">
          {durationLabel(task.durationMinutes)}
          <span className="mx-1.5 text-muted-soft">·</span>
          {task.completed ? "when did you get to it?" : "tap a time you're free"}
          {task.dueDate && !task.completed && (
            <span className="text-accent"> · due {dayLabel(new Date(task.dueDate))}</span>
          )}
        </p>
        {/* Keyed by task id so the picker resets each time it's reopened. */}
        <SlotPicker key={task.id} task={task} now={now} onDone={close} />
      </motion.div>
    </div>
  );
}

interface Bucket {
  label: string;
  slots: Date[];
}

/** Split a day's free slots into Morning / Afternoon / Evening for scannability. */
function bucketByPartOfDay(slots: Date[]): Bucket[] {
  const buckets: Bucket[] = [
    { label: "Morning", slots: [] },
    { label: "Afternoon", slots: [] },
    { label: "Evening", slots: [] },
  ];
  for (const s of slots) {
    const h = s.getHours();
    if (h < 12) buckets[0].slots.push(s);
    else if (h < 17) buckets[1].slots.push(s);
    else buckets[2].slots.push(s);
  }
  return buckets.filter((b) => b.slots.length > 0);
}

/** Short heading for a day pill: Today / Tomorrow / weekday. */
function dayHeading(day: Date): string {
  if (isToday(day)) return "Today";
  if (isTomorrow(day)) return "Tomorrow";
  return format(day, "EEE");
}

function SlotPicker({ task, now, onDone }: { task: Task; now: Date; onDone: () => void }) {
  const settings = useSettings();
  const allTasks = useAllTasks();
  const today = useMemo(() => startOfDay(now), [now]);
  const externalBusy = useExternalBusy(today, HORIZON_DAYS);

  // Every free start-time across the horizon that this task actually fits into.
  const slots = useMemo(
    () =>
      findFreeSlots({
        durationMinutes: task.durationMinutes,
        settings,
        tasks: allTasks,
        now,
        fromDay: today,
        days: HORIZON_DAYS,
        excludeTaskId: task.id,
        externalBusy,
        stepMinutes: 30,
        maxPerDay: 80,
        limit: 600,
      }),
    [task, settings, allTasks, now, today, externalBusy],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, Date[]>();
    for (const s of slots) {
      const k = startOfDay(s).toDateString();
      const list = m.get(k);
      if (list) list.push(s);
      else m.set(k, [s]);
    }
    return m;
  }, [slots]);

  const availableDays = useMemo(() => {
    const days: Date[] = [];
    for (let d = 0; d < HORIZON_DAYS; d++) {
      const day = addDays(today, d);
      if (byDay.has(day.toDateString())) days.push(day);
    }
    return days;
  }, [byDay, today]);

  // A to-do with a future preferred date opens the picker *on that day* —
  // "preferred" should guide placement, not just sort suggestions. It's a
  // default, not a wall: earlier days stay one tap away.
  const prefDay = useMemo(() => {
    if (task.completed || !task.preferredDate) return null;
    const p = startOfDay(new Date(task.preferredDate));
    return !Number.isNaN(p.getTime()) && p > today ? p : null;
  }, [task.completed, task.preferredDate, today]);

  // The task's current day, if it still has openings, is the friendly default;
  // then the preferred date; then the first day with room.
  const currentDay = task.scheduledStart ? startOfDay(new Date(task.scheduledStart)) : null;
  const preferredDay =
    (currentDay && byDay.has(currentDay.toDateString()) ? currentDay : null) ??
    (prefDay && byDay.has(prefDay.toDateString()) ? prefDay : null) ??
    availableDays[0] ??
    null;

  // User choices override the derived defaults; everything else is computed in
  // render, so changing day auto-picks that day's earliest slot (no effects).
  const [pickedDay, setPickedDay] = useState<Date | null>(null);
  const [pickedSlot, setPickedSlot] = useState<Date | null>(null);

  const activeDay =
    pickedDay && byDay.has(pickedDay.toDateString()) ? pickedDay : preferredDay;
  const daySlots = activeDay ? byDay.get(activeDay.toDateString()) ?? [] : [];
  const activeSlot =
    pickedSlot && daySlots.some((s) => s.getTime() === pickedSlot.getTime())
      ? pickedSlot
      : daySlots[0] ?? null;

  const buckets = useMemo(() => bucketByPartOfDay(daySlots), [daySlots]);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (!activeSlot || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (task.completed) {
        await updateTask(task.id, { scheduledStart: activeSlot.toISOString() });
      } else {
        await rescheduleTask(task.id, activeSlot);
      }
      onDone();
    } catch (err) {
      setSaving(false);
      setError(
        err instanceof ConflictError
          ? "That slot was just taken — pick another."
          : "Couldn't schedule — please try again.",
      );
    }
  }

  if (availableDays.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-paper-edge bg-paper-deep/30 px-4 py-6 text-center text-sm text-muted">
        No open time that fits in the next {HORIZON_DAYS} days. Try a shorter estimate, or widen
        your day windows in Settings.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Day selector — only days that actually have room. */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {availableDays.map((day) => {
          const active = !!activeDay && isSameDay(day, activeDay);
          return (
            <button
              key={day.toDateString()}
              type="button"
              onClick={() => {
                setPickedDay(day);
                setPickedSlot(null);
              }}
              className={cn(
                "relative shrink-0 rounded-xl px-3 py-2 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40",
                active ? "text-white" : "text-ink hover:bg-paper-edge/50",
              )}
            >
              {active && (
                <motion.span
                  layoutId="resched-day"
                  aria-hidden
                  className="absolute inset-0 rounded-xl bg-accent shadow-accent"
                  transition={{ type: "spring", stiffness: 520, damping: 34 }}
                />
              )}
              <span className="relative z-10 block text-[0.65rem] font-semibold uppercase tracking-wide opacity-90">
                {dayHeading(day)}
              </span>
              <span className="relative z-10 block text-sm font-semibold tabular-nums">
                {format(day, "d MMM")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Free slots on the chosen day, grouped by part of day. */}
      <div className="space-y-3">
        {buckets.map((bucket) => (
          <div key={bucket.label}>
            <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-soft">
              {bucket.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {bucket.slots.map((s) => {
                const on = !!activeSlot && s.getTime() === activeSlot.getTime();
                return (
                  <motion.button
                    key={s.toISOString()}
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setPickedSlot(s)}
                    aria-pressed={on}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm font-medium tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40",
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

      {error && <p className="text-xs font-medium text-accent">{error}</p>}

      <div className="flex items-center justify-between gap-3 border-t border-paper-edge pt-3">
        <p className="min-w-0 text-xs text-muted">
          {activeSlot ? (
            <>
              <span className="text-muted-soft">Schedules for </span>
              <span className="font-medium text-ink">
                {dayLabel(activeSlot)} · {timeLabel(activeSlot)}
              </span>
            </>
          ) : (
            "Pick a slot"
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!activeSlot || saving}>
            {saving ? "Scheduling…" : task.completed ? "Log it" : "Schedule"}
          </Button>
        </div>
      </div>
    </div>
  );
}
